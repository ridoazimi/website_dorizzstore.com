import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMemberAdmin } from "@/lib/member-admin-auth";

export async function GET() {
  const a = await requireMemberAdmin(); if ("error" in a) return a.error;
  return NextResponse.json(await prisma.$queryRawUnsafe<any[]>(`SELECT x.*,m.name member_name,r.name reward_name,r.fulfillment_type,r.product_id FROM member_redemptions x JOIN members m ON m.id=x.member_id JOIN member_rewards r ON r.id=x.reward_id ORDER BY x.created_at DESC`));
}

export async function PATCH(req: Request) {
  const a = await requireMemberAdmin(); if ("error" in a) return a.error;
  const { id, decision, rejectionReason, adminNotes } = await req.json();
  if (!id || !["approve","reject"].includes(decision)) return NextResponse.json({ error: "Keputusan tidak valid" }, { status: 400 });
  if (decision === "reject" && !String(rejectionReason || "").trim()) return NextResponse.json({ error: "Alasan penolakan wajib diisi" }, { status: 400 });

  try {
    const result = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRawUnsafe<any[]>(`SELECT x.*,r.name reward_name,r.fulfillment_type,r.product_id FROM member_redemptions x JOIN member_rewards r ON r.id=x.reward_id WHERE x.id=$1::uuid FOR UPDATE OF x`, id);
      const x = rows[0];
      if (!x || x.status !== "pending") throw new Error("ALREADY_PROCESSED");
      let voucherCode: string | null = null;

      if (decision === "approve") {
        if (x.fulfillment_type === "dorizz_voucher") {
          if (!x.product_id) throw new Error("REWARD_PRODUCT_MISSING");
          voucherCode = `MEM-${String(id).replace(/-/g, "").slice(0, 10).toUpperCase()}`;
          await tx.$executeRawUnsafe(`INSERT INTO vouchers(code,type,value,max_usage,current_usage,min_purchase,is_active,member_redemption_id,reward_product_id) VALUES($1,'PERCENTAGE',100,1,0,0,true,$2::uuid,$3::uuid)`, voucherCode, id, x.product_id);
        }
        await tx.$executeRawUnsafe(`UPDATE member_redemptions SET status='approved',voucher_code=$2,admin_notes=$3,processed_at=now(),processed_by=$4::uuid WHERE id=$1::uuid`, id, voucherCode, adminNotes || null, a.user.id);
        await tx.$executeRawUnsafe(`UPDATE member_point_ledger SET status='spent' WHERE source_type='reward_redemption_hold' AND source_id=$1::uuid AND status='held'`, id);
        await tx.$executeRawUnsafe(`INSERT INTO member_notifications(member_id,type,title,message,metadata) VALUES($1::uuid,'redemption_approved','Reward disetujui',$2,$3::jsonb)`, x.member_id, `Reward ${x.reward_name} kamu telah disetujui.`, JSON.stringify({ redemptionId: id, voucherCode }));
      } else {
        await tx.$executeRawUnsafe(`UPDATE member_redemptions SET status='rejected',rejection_reason=$2,admin_notes=$3,processed_at=now(),processed_by=$4::uuid WHERE id=$1::uuid`, id, rejectionReason, adminNotes || null, a.user.id);
        await tx.$executeRawUnsafe(`UPDATE member_point_ledger SET status='returned' WHERE source_type='reward_redemption_hold' AND source_id=$1::uuid AND status='held'`, id);
        await tx.$executeRawUnsafe(`INSERT INTO member_point_ledger(member_id,source_type,source_id,points,status,note) VALUES($1::uuid,'reward_redemption_release',$2::uuid,$3,'available',$4)`, x.member_id, id, Number(x.points), `Reward ditolak: ${rejectionReason}`);
        await tx.$executeRawUnsafe(`INSERT INTO member_notifications(member_id,type,title,message) VALUES($1::uuid,'redemption_rejected','Reward ditolak',$2)`, x.member_id, `Reward ${x.reward_name} ditolak: ${rejectionReason}`);
      }

      await tx.$executeRawUnsafe(`INSERT INTO member_admin_activity_log(admin_id,member_id,action,entity_type,entity_id,reason,details) VALUES($1::uuid,$2::uuid,$3,'redemption',$4::uuid,$5,$6::jsonb)`, a.user.id, x.member_id, `redemption_${decision}`, id, rejectionReason || adminNotes || null, JSON.stringify({ voucherCode }));
      return { voucherCode };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    const message = String(error?.message || error);
    if (message.includes("ALREADY_PROCESSED")) return NextResponse.json({ error: "Request tidak ditemukan atau sudah diproses" }, { status: 409 });
    if (message.includes("REWARD_PRODUCT_MISSING")) return NextResponse.json({ error: "Reward voucher belum terhubung ke produk" }, { status: 400 });
    console.error("Admin Member redemption error", error);
    return NextResponse.json({ error: "Gagal memproses redemption" }, { status: 500 });
  }
}
