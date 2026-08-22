import { NextRequest, NextResponse } from "next/server";
import { requireMemberAdmin } from "@/lib/member-admin-auth";
import { listMessages, listRestrictions, moderate, sendMessage } from "@/lib/member-community-db";

async function admin() {
  const auth = await requireMemberAdmin();
  if ("error" in auth) return auth;
  return { user: auth.user };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await admin();
    if ("error" in auth) return auth.error;
    const q = request.nextUrl.searchParams;
    const result = await listMessages({ direction: q.get("direction") || "initial", cursorId: q.get("cursorId"), cursorAt: q.get("cursorAt"), limit: Number(q.get("limit") || 50), adminView: true });
    const restrictions = q.get("restrictions") === "1" ? await listRestrictions() : undefined;
    return NextResponse.json({ ok: true, ...result, restrictions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin community history error", error);
    return NextResponse.json({ error: "Gagal memuat komunitas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await admin();
    if ("error" in auth) return auth.error;
    const body = await request.json();
    if (body?.action === "send") {
      const message = await sendMessage({ actorType: "admin", actorId: auth.user.id, actorName: auth.user.name || "DorizzStore", clientMessageId: body.clientMessageId, body: String(body.body || ""), replyToId: body.replyToId || null, adminView: true });
      return NextResponse.json({ ok: true, message });
    }
    if (!["delete","mute","ban","unban","unmute"].includes(body?.action)) return NextResponse.json({ error: "Aksi tidak valid" }, { status: 400 });
    await moderate({ adminId: auth.user.id, action: body.action, memberId: body.memberId, messageId: body.messageId, durationMinutes: body.durationMinutes, reason: String(body.reason || "Moderasi komunitas") });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const code = String(error?.message || "");
    const map: Record<string,string> = { MESSAGE_TOO_LONG:"Pesan maksimal 2.000 karakter", EMPTY_MESSAGE:"Pesan tidak boleh kosong", MESSAGE_NOT_FOUND:"Pesan tidak ditemukan", MEMBER_NOT_FOUND:"Member tidak ditemukan", BAD_DURATION:"Durasi mute tidak valid", REPLY_NOT_FOUND:"Pesan yang dibalas sudah tidak tersedia" };
    if (map[code]) return NextResponse.json({ error: map[code] }, { status: 400 });
    console.error("Admin community action error", error);
    return NextResponse.json({ error: "Aksi komunitas gagal" }, { status: 500 });
  }
}
