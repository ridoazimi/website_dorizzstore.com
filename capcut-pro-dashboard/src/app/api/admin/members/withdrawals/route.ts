import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMemberAdmin } from "@/lib/member-admin-auth";

export async function GET() {
  const a = await requireMemberAdmin(); if ("error" in a) return a.error;
  return NextResponse.json(await prisma.$queryRawUnsafe<any[]>(`SELECT w.id,w.member_id,w.points,w.point_value_rupiah,w.amount_rupiah::text AS amount_rupiah,w.method,w.account_number,w.account_name,w.status,w.rejection_reason,w.admin_notes,w.created_at,w.processed_at,w.processed_by,m.name member_name FROM member_withdrawals w JOIN members m ON m.id=w.member_id ORDER BY w.created_at DESC`));
}

export async function PATCH(req: Request) {
  const a = await requireMemberAdmin(); if ("error" in a) return a.error;
  const { id, decision, rejectionReason, adminNotes } = await req.json();
  if (!id || !["approve","reject"].includes(decision)) return NextResponse.json({ error: "Keputusan tidak valid" }, { status: 400 });
  if (decision === "reject" && !String(rejectionReason || "").trim()) return NextResponse.json({ error: "Alasan penolakan wajib diisi" }, { status: 400 });

  try {
    await prisma.$transaction(async tx => {
      const rows = await tx.$queryRawUnsafe<any[]>(`SELECT * FROM member_withdrawals WHERE id=$1::uuid FOR UPDATE`, id);
      const w = rows[0];
      if (!w || w.status !== "pending") throw new Error("ALREADY_PROCESSED");

      if (decision === "approve") {
        await tx.$executeRawUnsafe(`UPDATE member_withdrawals SET status='approved',admin_notes=$2,processed_at=now(),processed_by=$3::uuid WHERE id=$1::uuid`, id, adminNotes || null, a.user.id);
        await tx.$executeRawUnsafe(`UPDATE member_point_ledger SET status='spent' WHERE source_type='cash_withdrawal_hold' AND source_id=$1::uuid AND status='held'`, id);
        await tx.$executeRawUnsafe(`INSERT INTO member_notifications(member_id,type,title,message) VALUES($1::uuid,'withdrawal_approved','Withdrawal disetujui','Pengajuan pencairan poin kamu telah disetujui.')`, w.member_id);
      } else {
        await tx.$executeRawUnsafe(`UPDATE member_withdrawals SET status='rejected',rejection_reason=$2,admin_notes=$3,processed_at=now(),processed_by=$4::uuid WHERE id=$1::uuid`, id, rejectionReason, adminNotes || null, a.user.id);
        await tx.$executeRawUnsafe(`UPDATE member_point_ledger SET status='returned' WHERE source_type='cash_withdrawal_hold' AND source_id=$1::uuid AND status='held'`, id);
        await tx.$executeRawUnsafe(`INSERT INTO member_point_ledger(member_id,source_type,source_id,points,status,note) VALUES($1::uuid,'cash_withdrawal_release',$2::uuid,$3,'available',$4)`, w.member_id, id, Number(w.points), `Withdrawal ditolak: ${rejectionReason}`);
        await tx.$executeRawUnsafe(`INSERT INTO member_notifications(member_id,type,title,message) VALUES($1::uuid,'withdrawal_rejected','Withdrawal ditolak',$2)`, w.member_id, `Withdrawal ditolak: ${rejectionReason}`);
      }

      await tx.$executeRawUnsafe(`INSERT INTO member_admin_activity_log(admin_id,member_id,action,entity_type,entity_id,reason) VALUES($1::uuid,$2::uuid,$3,'withdrawal',$4::uuid,$5)`, a.user.id, w.member_id, `withdrawal_${decision}`, id, rejectionReason || adminNotes || null);
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const message = String(error?.message || error);
    if (message.includes("ALREADY_PROCESSED")) return NextResponse.json({ error: "Withdrawal tidak ditemukan atau sudah diproses" }, { status: 409 });
    console.error("Admin Member withdrawal error", error);
    return NextResponse.json({ error: "Gagal memproses withdrawal" }, { status: 500 });
  }
}
