import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMember, getMemberBalances } from "@/lib/member";
export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT id,name,email,referral_code,status,joined_at FROM members WHERE id=$1::uuid AND status='active'`, member.id);
  if (!rows[0]) return NextResponse.json({ error: "Member tidak aktif" }, { status: 403 });
  const balances = await getMemberBalances(member.id);
  const referrals = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int total, COUNT(*) FILTER(WHERE points_awarded>0)::int rewarded FROM member_referrals WHERE member_id=$1::uuid`, member.id);
  const history = await prisma.$queryRawUnsafe<any[]>(`SELECT mr.created_at,mr.points_awarded,split_part(u.name,' ',1) customer_name FROM member_referrals mr LEFT JOIN users u ON u.id=mr.user_id WHERE mr.member_id=$1::uuid ORDER BY mr.created_at DESC LIMIT 30`, member.id);
  const rewards = await prisma.$queryRawUnsafe<any[]>(`SELECT id,name,description,points_required,fulfillment_type FROM member_rewards WHERE is_active=true ORDER BY points_required ASC`);
  const nextReward = rewards.find(r => Number(r.points_required) > balances.available) || rewards[0] || null;
  return NextResponse.json({ member: { name: rows[0].name, referralCode: rows[0].referral_code, referralUrl: `/r/${rows[0].referral_code}` }, points: balances, referrals: referrals[0] || {total:0,rewarded:0}, history, rewards, progress: nextReward ? { current: balances.available, target: Number(nextReward.points_required), reward: nextReward.name } : null });
}
