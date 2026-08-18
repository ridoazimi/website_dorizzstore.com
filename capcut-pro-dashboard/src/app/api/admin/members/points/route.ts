import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMemberAdmin } from "@/lib/member-admin-auth";

export async function POST(req: Request) {
  const a = await requireMemberAdmin();
  if ("error" in a) return a.error;
  const { memberId, points, reason } = await req.json();
  const p = Number(points);
  if (!memberId || !Number.isInteger(p) || p === 0 || !String(reason || "").trim()) {
    return NextResponse.json({ error: "Member, jumlah poin, dan alasan wajib diisi" }, { status: 400 });
  }

  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, String(memberId));
      const memberRows = await tx.$queryRawUnsafe<any[]>(`SELECT id,status FROM members WHERE id=$1::uuid FOR UPDATE`, memberId);
      if (!memberRows[0]) throw new Error("MEMBER_NOT_FOUND");
      const balanceRows = await tx.$queryRawUnsafe<Array<{ available: number }>>(
        `SELECT COALESCE(SUM(CASE WHEN status='available' THEN points ELSE 0 END),0)::int available FROM member_point_ledger WHERE member_id=$1::uuid`, memberId
      );
      const available = Number(balanceRows[0]?.available || 0);
      if (available + p < 0) throw new Error("NEGATIVE_BALANCE");

      await tx.$executeRawUnsafe(
        `INSERT INTO member_point_ledger(member_id,source_type,points,status,note,actor_admin_id)
         VALUES($1::uuid,'admin_adjustment',$2,'available',$3,$4::uuid)`, memberId, p, reason, a.user.id
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO member_admin_activity_log(admin_id,member_id,action,entity_type,reason,details)
         VALUES($1::uuid,$2::uuid,'points_adjusted','point_ledger',$3,$4::jsonb)`,
        a.user.id, memberId, reason, JSON.stringify({ points: p, balanceBefore: available, balanceAfter: available + p })
      );
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const message = String(error?.message || error);
    if (message.includes("MEMBER_NOT_FOUND")) return NextResponse.json({ error: "Member tidak ditemukan" }, { status: 404 });
    if (message.includes("NEGATIVE_BALANCE")) return NextResponse.json({ error: "Koreksi tidak boleh membuat saldo poin negatif" }, { status: 400 });
    console.error("Member point adjustment error", error);
    return NextResponse.json({ error: "Gagal mengoreksi poin" }, { status: 500 });
  }
}
