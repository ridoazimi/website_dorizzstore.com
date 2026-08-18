import "server-only";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "capcut-dashboard-secret-key-change-in-production");
const COOKIE_NAME = "member_token";

export type MemberPayload = { id: string; email: string; name: string; role: "member" };

export function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
export function normalizeWhatsapp(value?: string | null) {
  if (!value) return "";
  let n = value.replace(/\D/g, "");
  if (n.startsWith("0")) n = `62${n.slice(1)}`;
  if (!n.startsWith("62")) n = `62${n}`;
  return n;
}

export function generateReferralCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export async function memberSetting(key: string, fallback: number): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ value: unknown }>>(
    `SELECT value FROM member_settings WHERE key = $1 LIMIT 1`, key
  );
  const raw = rows[0]?.value;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export async function signMemberToken(payload: MemberPayload) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(JWT_SECRET);
}
export async function setMemberCookie(token: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60*60*24*30, path: "/" });
}
export async function getMember() : Promise<MemberPayload | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.role !== "member") return null;
    return payload as unknown as MemberPayload;
  } catch { return null; }
}
export async function clearMemberCookie() { (await cookies()).delete(COOKIE_NAME); }
export async function hashMemberPassword(password: string) { return bcrypt.hash(password, 12); }
export async function verifyMemberPassword(password: string, hash: string) { return bcrypt.compare(password, hash); }

export async function getMemberBalances(memberId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ available: bigint; held: bigint }>>(
    `SELECT
      COALESCE(SUM(CASE WHEN status='available' THEN points ELSE 0 END),0)::bigint AS available,
      COALESCE(SUM(CASE WHEN status='held' THEN ABS(points) ELSE 0 END),0)::bigint AS held
     FROM member_point_ledger WHERE member_id=$1::uuid`, memberId
  );
  return { available: Number(rows[0]?.available || 0), held: Number(rows[0]?.held || 0) };
}

export async function creditMemberReferral(tx: any, input: { memberId?: string | null; userId: string; transactionId: string; userEmail: string; userWhatsapp?: string | null }) {
  if (!input.memberId) return { points: 0, reason: "no_member" };
  const memberRows = await tx.$queryRawUnsafe(`SELECT id,name,email,whatsapp,status FROM members WHERE id=$1::uuid LIMIT 1`, input.memberId) as any[];
  const member = memberRows[0];
  if (!member || member.status !== "active") return { points: 0, reason: "inactive_member" };

  const selfReferral = normalizeEmail(member.email) === normalizeEmail(input.userEmail) ||
    (!!member.whatsapp && normalizeWhatsapp(member.whatsapp) === normalizeWhatsapp(input.userWhatsapp));

  const prior = await tx.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM transactions t JOIN users u ON u.id=t.user_id
     WHERE t.status='success' AND t.id<>$1::uuid AND (LOWER(u.email)=LOWER($2) OR ($3<>'' AND regexp_replace(COALESCE(u.whatsapp,''),'\\D','','g') IN ($3,$4)))`,
    input.transactionId, normalizeEmail(input.userEmail), normalizeWhatsapp(input.userWhatsapp), input.userWhatsapp?.replace(/\D/g, "") || ""
  ) as Array<{count:number}>;
  const isNewCustomer = Number(prior[0]?.count || 0) === 0;
  const points = !selfReferral && isNewCustomer ? await memberSetting("referral_points", 3) : 0;

  await tx.$executeRawUnsafe(
    `INSERT INTO member_referrals(member_id,user_id,transaction_id,is_new_customer,is_self_referral,points_awarded)
     VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6) ON CONFLICT(transaction_id) DO NOTHING`,
    input.memberId,input.userId,input.transactionId,isNewCustomer,selfReferral,points
  );
  if (points > 0) {
    await tx.$executeRawUnsafe(
      `INSERT INTO member_point_ledger(member_id,user_id,transaction_id,source_type,points,status,note)
       VALUES($1::uuid,$2::uuid,$3::uuid,'referral_reward',$4,'available','Referral customer baru berhasil') ON CONFLICT DO NOTHING`,
      input.memberId,input.userId,input.transactionId,points
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO member_notifications(member_id,type,title,message,metadata) VALUES($1::uuid,'points_earned','Poin bertambah',$2,$3::jsonb)`,
      input.memberId,`+${points} poin dari referral berhasil.`,JSON.stringify({ transactionId: input.transactionId, points })
    );
  }
  return { points, isNewCustomer, selfReferral };
}
