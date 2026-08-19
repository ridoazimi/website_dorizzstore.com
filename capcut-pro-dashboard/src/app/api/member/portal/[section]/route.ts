import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMember, getMemberBalances, memberSetting } from "@/lib/member";

const labels: Record<string,string> = {
  referral_reward: "Referral berhasil",
  admin_adjustment: "Penyesuaian admin",
  reward_redemption_hold: "Poin di-hold untuk reward",
  reward_redemption_release: "Poin reward dikembalikan",
  withdrawal_hold: "Poin di-hold untuk withdrawal",
  withdrawal_release: "Poin withdrawal dikembalikan",
};

export async function GET(_req: Request, context: { params: Promise<{ section: string }> }) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { section } = await context.params;
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT id,name,email,whatsapp,referral_code,status,joined_at FROM members WHERE id=$1::uuid LIMIT 1`, member.id);
  const m = rows[0];
  if (!m || m.status !== "active") return NextResponse.json({ error: "Member tidak aktif" }, { status: 403 });
  const balances = await getMemberBalances(member.id);
  const pointValue = await memberSetting("point_value_rupiah", 3000);

  if (section === "dashboard") {
    const [summary, monthly, rewards, activity, pending] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE points_awarded>0)::int rewarded,COALESCE(SUM(points_awarded),0)::int points FROM member_referrals WHERE member_id=$1::uuid`, member.id),
      prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int referrals,COALESCE(SUM(points_awarded),0)::int points FROM member_referrals WHERE member_id=$1::uuid AND created_at>=date_trunc('month',now())`, member.id),
      prisma.$queryRawUnsafe<any[]>(`SELECT id,name,description,points_required,fulfillment_type FROM member_rewards WHERE is_active=true ORDER BY points_required ASC LIMIT 20`),
      prisma.$queryRawUnsafe<any[]>(`SELECT source_type,points,status,note,created_at FROM member_point_ledger WHERE member_id=$1::uuid ORDER BY created_at DESC LIMIT 6`, member.id),
      prisma.$queryRawUnsafe<any[]>(`SELECT (SELECT COUNT(*) FROM member_redemptions WHERE member_id=$1::uuid AND status='pending')::int pending_redemptions,(SELECT COUNT(*) FROM member_withdrawals WHERE member_id=$1::uuid AND status='pending')::int pending_withdrawals,(SELECT COUNT(*) FROM member_redemptions WHERE member_id=$1::uuid AND status IN ('approved','completed'))::int redeemed`, member.id),
    ]);
    const nextReward = rewards.find((r:any)=>Number(r.points_required)>balances.available) || null;
    return NextResponse.json({ member:m, points:{...balances,pointValue}, referrals:summary[0], monthly:monthly[0], pending:pending[0], nextReward, recentActivity: activity.map((x:any)=>({...x,label:labels[x.source_type]||"Aktivitas poin"})) });
  }

  if (section === "referral") {
    const [summary, monthly, history] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE points_awarded>0)::int successful,COALESCE(SUM(points_awarded),0)::int points FROM member_referrals WHERE member_id=$1::uuid`, member.id),
      prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int successful,COALESCE(SUM(points_awarded),0)::int points FROM member_referrals WHERE member_id=$1::uuid AND points_awarded>0 AND created_at>=date_trunc('month',now())`, member.id),
      prisma.$queryRawUnsafe<any[]>(`SELECT mr.id,mr.created_at,mr.points_awarded,mr.is_new_customer,mr.is_self_referral,split_part(COALESCE(u.name,'Customer'),' ',1) customer_name,t.id transaction_id,t.status transaction_status FROM member_referrals mr LEFT JOIN users u ON u.id=mr.user_id LEFT JOIN transactions t ON t.id=mr.transaction_id WHERE mr.member_id=$1::uuid ORDER BY mr.created_at DESC LIMIT 100`, member.id),
    ]);
    return NextResponse.json({ member:m, referralUrl:`/r/${m.referral_code}`, summary:summary[0], monthly:monthly[0], history, referralWindowDays:await memberSetting("referral_window_days",30), referralPoints:await memberSetting("referral_points",3) });
  }

  if (section === "points") {
    const [ledger,lifetime] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`SELECT id,source_type,points,status,note,created_at FROM member_point_ledger WHERE member_id=$1::uuid ORDER BY created_at DESC LIMIT 150`, member.id),
      prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(SUM(CASE WHEN points>0 THEN points ELSE 0 END),0)::int earned FROM member_point_ledger WHERE member_id=$1::uuid`, member.id),
    ]);
    return NextResponse.json({ points:{...balances,pointValue,lifetimeEarned:Number(lifetime[0]?.earned||0)}, ledger:ledger.map((x:any)=>({...x,label:labels[x.source_type]||"Aktivitas poin"})) });
  }

  if (section === "rewards") {
    const rewards = await prisma.$queryRawUnsafe<any[]>(`SELECT id,name,description,points_required,fulfillment_type FROM member_rewards WHERE is_active=true ORDER BY points_required ASC`);
    return NextResponse.json({ points:balances, rewards });
  }

  if (section === "redemptions") {
    return NextResponse.json(await prisma.$queryRawUnsafe<any[]>(`SELECT x.id,x.points,x.status,x.voucher_code,x.rejection_reason,x.created_at,x.processed_at,r.name reward_name,r.fulfillment_type,r.product_id FROM member_redemptions x JOIN member_rewards r ON r.id=x.reward_id WHERE x.member_id=$1::uuid ORDER BY x.created_at DESC LIMIT 100`, member.id));
  }

  if (section === "withdrawals") {
    const minimum = await memberSetting("minimum_withdraw_points",30);
    const history = await prisma.$queryRawUnsafe<any[]>(`SELECT id,points,amount_rupiah::text AS amount_rupiah,method,account_number,account_name,status,rejection_reason,created_at,processed_at FROM member_withdrawals WHERE member_id=$1::uuid ORDER BY created_at DESC LIMIT 100`, member.id);
    return NextResponse.json({ points:{...balances,pointValue}, minimum, history });
  }

  if (section === "leaderboard") {
    const ranking=await prisma.$queryRawUnsafe<any[]>(`WITH scores AS (SELECT m.id,m.name,COALESCE(SUM(CASE WHEN l.source_type='referral_reward' AND l.points>0 THEN l.points ELSE 0 END),0)::int points FROM members m LEFT JOIN member_point_ledger l ON l.member_id=m.id AND l.created_at>=date_trunc('month',now()) AND l.created_at<date_trunc('month',now())+interval '1 month' WHERE m.status='active' GROUP BY m.id), ranked AS (SELECT *,RANK() OVER(ORDER BY points DESC,name ASC)::int rank FROM scores) SELECT * FROM ranked ORDER BY rank,name`);
    const self=ranking.find((r:any)=>r.id===member.id)||null;
    const campaign=await prisma.$queryRawUnsafe<any[]>(`SELECT c.id,c.name,c.month_start,c.month_end,c.status,COALESCE(json_agg(json_build_object('rank',p.rank,'prizeName',p.prize_name) ORDER BY p.rank) FILTER(WHERE p.id IS NOT NULL),'[]') prizes FROM member_leaderboard_campaigns c LEFT JOIN member_leaderboard_prizes p ON p.campaign_id=c.id WHERE c.status='active' GROUP BY c.id ORDER BY c.month_start DESC LIMIT 1`);
    const top10=ranking.slice(0,10).map((r:any)=>({rank:r.rank,name:r.name,points:r.points}));
    const top10Cutoff=top10.length===10?Number(top10[9].points):0;
    return NextResponse.json({ top10,self:self?{rank:self.rank,name:self.name,points:self.points}:null,campaign:campaign[0]||null,pointsToTop10:self&&self.rank>10?Math.max(0,top10Cutoff-Number(self.points)+1):0 });
  }

  if (section === "notifications") {
    return NextResponse.json(await prisma.$queryRawUnsafe<any[]>(`SELECT id,type,title,message,is_read,metadata,created_at FROM member_notifications WHERE member_id=$1::uuid ORDER BY created_at DESC LIMIT 100`, member.id));
  }

  if (section === "activity") {
    const [ledger,refs,reds,wd] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`SELECT id,'points' kind,source_type type,points,note message,status,created_at FROM member_point_ledger WHERE member_id=$1::uuid ORDER BY created_at DESC LIMIT 80`,member.id),
      prisma.$queryRawUnsafe<any[]>(`SELECT id,'referral' kind,'referral' type,points_awarded points,CASE WHEN points_awarded>0 THEN 'Referral berhasil' ELSE 'Referral tidak eligible' END message,'success' status,created_at FROM member_referrals WHERE member_id=$1::uuid ORDER BY created_at DESC LIMIT 80`,member.id),
      prisma.$queryRawUnsafe<any[]>(`SELECT x.id,'redemption' kind,'redemption' type,-x.points points,('Penukaran '||r.name) message,x.status,x.created_at FROM member_redemptions x JOIN member_rewards r ON r.id=x.reward_id WHERE x.member_id=$1::uuid ORDER BY x.created_at DESC LIMIT 80`,member.id),
      prisma.$queryRawUnsafe<any[]>(`SELECT id,'withdrawal' kind,'withdrawal' type,-points points,'Pengajuan withdrawal' message,status,created_at FROM member_withdrawals WHERE member_id=$1::uuid ORDER BY created_at DESC LIMIT 80`,member.id),
    ]);
    return NextResponse.json([...ledger,...refs,...reds,...wd].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).slice(0,120).map((x:any)=>({...x,label:labels[x.type]||x.message})));
  }

  if (section === "profile") {
    const terms=await prisma.$queryRawUnsafe<any[]>(`SELECT terms_version,accepted_at FROM member_terms_acceptances WHERE member_id=$1::uuid ORDER BY accepted_at DESC LIMIT 1`,member.id);
    return NextResponse.json({ member:m, terms:terms[0]||null });
  }

  if (section === "help") {
    return NextResponse.json({ referralPoints:await memberSetting("referral_points",3), pointValue, minimumWithdrawal:await memberSetting("minimum_withdraw_points",30), referralWindowDays:await memberSetting("referral_window_days",30) });
  }

  return NextResponse.json({ error: "Section tidak ditemukan" }, { status: 404 });
}
