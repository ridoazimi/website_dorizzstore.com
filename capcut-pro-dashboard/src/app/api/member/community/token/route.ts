import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMember } from "@/lib/member";
import { getActiveMember, listMessages, sendMessage } from "@/lib/member-community-db";

async function actor() {
  const session = await getMember();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const state = await getActiveMember(session.id);
  if (!state.ok) return { error: NextResponse.json({ error: state.error }, { status: state.status }) };
  return { session, state };
}

async function avatarMap(messageIds: string[]) {
  if (!messageIds.length) return new Map<string,string|null>();
  const rows = await prisma.$queryRawUnsafe<Array<{ id:string; avatar_url:string|null }>>(
    `SELECT c.id,m.avatar_url FROM member_community_messages c LEFT JOIN members m ON m.id=c.member_id WHERE c.id = ANY($1::uuid[])`,
    messageIds
  );
  return new Map(rows.map((row) => [row.id, row.avatar_url || null]));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await actor();
    if ("error" in auth) return auth.error;
    const q = request.nextUrl.searchParams;
    const result = await listMessages({ direction: q.get("direction") || "initial", cursorId: q.get("cursorId"), cursorAt: q.get("cursorAt"), limit: Number(q.get("limit") || 50) });
    const avatars = await avatarMap(result.messages.map((message:any) => message.id));
    const messages = result.messages.map((message:any) => ({ ...message, senderAvatarUrl: message.isAdmin ? null : (avatars.get(message.id) || null) }));
    const selfRows = await prisma.$queryRawUnsafe<Array<{ avatar_url:string|null }>>(`SELECT avatar_url FROM members WHERE id=$1::uuid LIMIT 1`, auth.session.id);
    const restriction = auth.state.member.community_status === "muted" && auth.state.member.muted_until
      ? { status: "muted", mutedUntil: new Date(auth.state.member.muted_until).toISOString() }
      : { status: "active", mutedUntil: null };
    return NextResponse.json({ ok: true, ...result, messages, restriction, self: { name: auth.state.member.name, avatarUrl: selfRows[0]?.avatar_url || null } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Member community history error", error);
    return NextResponse.json({ error: "Gagal memuat komunitas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await actor();
    if ("error" in auth) return auth.error;
    const body = await request.json();
    if (!body || Object.keys(body).some((key) => !["clientMessageId","body","replyToId"].includes(key))) return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
    const message = await sendMessage({ actorType: "member", actorId: auth.session.id, actorName: auth.state.member.name, clientMessageId: body.clientMessageId, body: String(body.body || ""), replyToId: body.replyToId || null });
    return NextResponse.json({ ok: true, message }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const code = String(error?.message || "");
    const map: Record<string,string> = { EMPTY_MESSAGE:"Pesan tidak boleh kosong", MESSAGE_TOO_LONG:"Pesan maksimal 2.000 karakter", RATE_LIMIT:"Kamu mengirim pesan terlalu cepat", COMMUNITY_MUTED:"Kamu sedang di-mute", COMMUNITY_BANNED:"Akses komunitas dibatasi", MEMBER_INACTIVE:"Member tidak aktif", REPLY_NOT_FOUND:"Pesan yang dibalas sudah tidak tersedia" };
    const status = ["COMMUNITY_MUTED","COMMUNITY_BANNED","MEMBER_INACTIVE"].includes(code) ? 403 : 400;
    if (map[code]) return NextResponse.json({ error: map[code], mutedUntil: error?.mutedUntil || null }, { status });
    console.error("Member community send error", error);
    return NextResponse.json({ error: "Gagal mengirim pesan" }, { status: 500 });
  }
}
