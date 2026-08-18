import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMemberAdmin } from "@/lib/member-admin-auth";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const a = await requireMemberAdmin();
  if ("error" in a) return a.error;
  const { id } = await context.params;

  const members = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id,name,email,whatsapp,referral_code,status,joined_at,left_at,created_at FROM members WHERE id=$1::uuid LIMIT 1`, id
  );
  if (!members[0]) return NextResponse.json({ error: "Member tidak ditemukan" }, { status: 404 });

  const [balances, referralSummary, referrals, ledger, redemptions, withdrawals, notifications, terms, adminActivity] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(SUM(CASE WHEN status='available' THEN points ELSE 0 END),0)::int available,COALESCE(SUM(CASE WHEN status='held' THEN ABS(points) ELSE 0 END),0)::int held FROM member_point_ledger WHERE member_id=$1::uuid`, id),
    prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE points_awarded>0)::int rewarded,COALESCE(SUM(points_awarded),0)::int points FROM member_referrals WHERE member_id=$1::uuid`, id),
    prisma.$queryRawUnsafe<any[]>(`SELECT mr.id,mr.created_at,mr.points_awarded,mr.is_new_customer,mr.is_self_referral,split_part(u.name,' ',1) customer_name,t.id transaction_id,t.status transaction_status FROM member_referrals mr LEFT JOIN users u ON u.id=mr.user_id LEFT JOIN transactions t ON t.id=mr.transaction_id WHERE mr.member_id=$1::uuid ORDER BY mr.created_at DESC LIMIT 100`, id),
    prisma.$queryRawUnsafe<any[]>(`SELECT id,source_type,source_id,points,status,note,created_at FROM member_point_ledger WHERE member_id=$1::uuid ORDER BY created_at DESC LIMIT 150`, id),
    prisma.$queryRawUnsafe<any[]>(`SELECT x.id,x.points,x.status,x.voucher_code,x.rejection_reason,x.created_at,r.name reward_name FROM member_redemptions x JOIN member_rewards r ON r.id=x.reward_id WHERE x.member_id=$1::uuid ORDER BY x.created_at DESC LIMIT 100`, id),
    prisma.$queryRawUnsafe<any[]>(`SELECT id,points,amount_rupiah,method,account_name,status,rejection_reason,created_at FROM member_withdrawals WHERE member_id=$1::uuid ORDER BY created_at DESC LIMIT 100`, id),
    prisma.$queryRawUnsafe<any[]>(`SELECT id,type,title,message,is_read,created_at FROM member_notifications WHERE member_id=$1::uuid ORDER BY created_at DESC LIMIT 100`, id),
    prisma.$queryRawUnsafe<any[]>(`SELECT terms_version,accepted_at,ip_address,user_agent FROM member_terms_acceptances WHERE member_id=$1::uuid ORDER BY accepted_at DESC`, id),
    prisma.$queryRawUnsafe<any[]>(`SELECT l.id,l.action,l.entity_type,l.entity_id,l.reason,l.details,l.created_at,a.name admin_name FROM member_admin_activity_log l LEFT JOIN admin_users a ON a.id=l.admin_id WHERE l.member_id=$1::uuid ORDER BY l.created_at DESC LIMIT 100`, id),
  ]);

  return NextResponse.json({
    member: members[0],
    points: balances[0] || { available: 0, held: 0 },
    referralSummary: referralSummary[0] || { total: 0, rewarded: 0, points: 0 },
    referrals,
    ledger,
    redemptions,
    withdrawals,
    notifications,
    terms,
    adminActivity,
  });
}
