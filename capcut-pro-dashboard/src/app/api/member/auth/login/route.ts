import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeEmail, setMemberCookie, signMemberToken, verifyMemberPassword } from "@/lib/member";
export async function POST(req: Request) {
  const { email, password } = await req.json();
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT id,name,email,password,status FROM members WHERE email=$1 LIMIT 1`, normalizeEmail(email || ""));
  const member = rows[0];
  if (!member || member.status !== "active" || !(await verifyMemberPassword(password || "", member.password))) return NextResponse.json({ error: "Email atau password salah" }, { status: 401 });
  await setMemberCookie(await signMemberToken({ id: member.id, email: member.email, name: member.name, role: "member" }));
  return NextResponse.json({ success: true });
}
