import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMemberAdmin } from "@/lib/member-admin-auth";

export async function GET(req: Request) {
  const a = await requireMemberAdmin();
  if ("error" in a) return a.error;
  const params = new URL(req.url).searchParams;
  const q = params.get("q") || "";
  const status = params.get("status") || "all";
  const sort = params.get("sort") || "joined_desc";
  const order = sort === "joined_asc" ? "m.joined_at ASC" : sort === "points_desc" ? "points DESC,m.joined_at DESC" : sort === "referrals_desc" ? "referrals DESC,m.joined_at DESC" : "m.joined_at DESC";
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT m.id,m.name,m.email,m.whatsapp,m.referral_code,m.status,m.joined_at,
      COALESCE(SUM(CASE WHEN l.status='available' THEN l.points ELSE 0 END),0)::int points,
      (SELECT COUNT(*) FROM member_referrals mr WHERE mr.member_id=m.id AND mr.points_awarded>0)::int referrals
     FROM members m LEFT JOIN member_point_ledger l ON l.member_id=m.id
     WHERE ($1='' OR m.name ILIKE '%'||$1||'%' OR m.email ILIKE '%'||$1||'%' OR m.referral_code ILIKE '%'||$1||'%')
       AND ($2='all' OR m.status=$2)
     GROUP BY m.id ORDER BY ${order} LIMIT 150`, q, status
  );
  return NextResponse.json(rows);
}

export async function PATCH(req: Request) {
  const a = await requireMemberAdmin();
  if ("error" in a) return a.error;
  const { memberId, status, reason } = await req.json();
  if (!memberId || !status || !String(reason || "").trim()) return NextResponse.json({ error: "Member, status, dan alasan wajib diisi" }, { status: 400 });
  if (status === "left") {
    await prisma.$executeRawUnsafe(`SELECT exit_member_program($1::uuid,$2::uuid,$3)`, memberId, a.user.id, reason);
  } else {
    await prisma.$executeRawUnsafe(`UPDATE members SET status=$2,left_at=NULL,updated_at=now() WHERE id=$1::uuid`, memberId, status);
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO member_admin_activity_log(admin_id,member_id,action,entity_type,entity_id,reason)
     VALUES($1::uuid,$2::uuid,'member_status_changed','member',$2::uuid,$3)`,
    a.user.id, memberId, reason
  );
  return NextResponse.json({ success: true });
}
