import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMember } from "@/lib/member";

export async function GET() {
  const m = await getMember();
  if (!m) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await prisma.$queryRawUnsafe<any[]>(`SELECT id,type,title,message,is_read,metadata,created_at FROM member_notifications WHERE member_id=$1::uuid ORDER BY created_at DESC LIMIT 100`, m.id));
}

export async function PATCH(req: Request) {
  const m = await getMember();
  if (!m) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, all } = await req.json();
  if (all === true) {
    await prisma.$executeRawUnsafe(`UPDATE member_notifications SET is_read=true WHERE member_id=$1::uuid AND is_read=false`, m.id);
  } else if (id) {
    await prisma.$executeRawUnsafe(`UPDATE member_notifications SET is_read=true WHERE id=$1::uuid AND member_id=$2::uuid`, id, m.id);
  } else {
    return NextResponse.json({ error: "Notification id atau all wajib diisi" }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
