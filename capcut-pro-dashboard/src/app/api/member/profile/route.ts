import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMember, hashMemberPassword, normalizeWhatsapp, verifyMemberPassword } from "@/lib/member";

export async function PATCH(req: Request) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  if (body.action === "profile") {
    const name = String(body.name || "").trim();
    if (name.length < 2 || name.length > 120) return NextResponse.json({ error: "Nama tidak valid" }, { status: 400 });
    const whatsapp = normalizeWhatsapp(body.whatsapp) || null;
    await prisma.$executeRawUnsafe(`UPDATE members SET name=$2,whatsapp=$3,updated_at=now() WHERE id=$1::uuid AND status='active'`, member.id, name, whatsapp);
    return NextResponse.json({ success: true, message: "Profil berhasil diperbarui." });
  }

  if (body.action === "password") {
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    if (newPassword.length < 8) return NextResponse.json({ error: "Password baru minimal 8 karakter" }, { status: 400 });
    const rows = await prisma.$queryRawUnsafe<Array<{ password: string }>>(`SELECT password FROM members WHERE id=$1::uuid AND status='active' LIMIT 1`, member.id);
    if (!rows[0] || !(await verifyMemberPassword(currentPassword, rows[0].password))) return NextResponse.json({ error: "Password saat ini salah" }, { status: 400 });
    const hashed = await hashMemberPassword(newPassword);
    await prisma.$executeRawUnsafe(`UPDATE members SET password=$2,updated_at=now() WHERE id=$1::uuid`, member.id, hashed);
    return NextResponse.json({ success: true, message: "Password berhasil diganti." });
  }

  return NextResponse.json({ error: "Action tidak valid" }, { status: 400 });
}
