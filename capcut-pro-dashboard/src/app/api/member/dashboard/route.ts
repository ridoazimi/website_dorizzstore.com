import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMember, getMemberBalances, memberSetting } from "@/lib/member";
export async function GET() {
  const member=await getMember();if(!member)return NextResponse.json({error:"Unauthorized"},{status:401});
  const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT id,name,email,referral_code,status,joined_at FROM members WHERE id=$1::uuid AND status='active'`,member.id);if(!rows[0])return NextResponse.json({error:"Member tidak aktif"},{status:403});
  const balances=await getMemberBalances(member.id);
  const [referrals,history,rewards,redemptions,withdrawals,notifications,ledger,monthly]=await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE points_awarded>0)::int rewarded FROM member_referrals WHERE member_id=$1::uuid`,member.id),
    prisma.$queryRawUnsafe<any[]>(`SELECT mr.created_at,mr.points_awarded,split_part(u.name,' ',1) customer_name FROM member_referrals mr LEFT JOIN users u ON u.id=mr.user_id WHERE mr.member_id=$1::uuid ORDER BY mr.created_at DESC LIMIT 30`,member.id),
    prisma.$queryRawUnsafe<any[]>(`SELECT id,name,description,points_required,fulfillment_type FROM member_rewards WHERE is_active=true ORDER BY points_required ASC`,member.id),
    prisma.$queryRawUnsafe<any[]>(`SELECT x.id,x.points,x.status,x.voucher_code,x.rejection_reason,x.created_at,r.name reward_name FROM member_redemptions x JOIN member_rewards r ON r.id=x.reward_id WHERE x.member_id=$1::uuid ORDER BY x.created_at DESC LIMIT 30`,member.id),
    prisma.$queryRawUnsafe<any[]>(`SELECT id,points,amount_rupiah,method,account_name,status,rejection_reason,created_at FROM member_withdrawals WHERE member_id=$1::uuid ORDER BY created_at DESC LIMIT 30`,member.id),
    prisma.$queryRawUnsafe<any[]>(`SELECT id,type,title,message,is_read,created_at FROM member_notifications WHERE member_id=$1::uuid ORDER BY created_at DESC LIMIT 30`,member.id),
    prisma.$queryRawUnsafe<any[]>(`SELECT id,source_type,points,status,note,created_at FROM member_point_ledger WHERE member_id=$1::uuid ORDER BY created_at DESC LIMIT 40`,member.id),
    prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int referrals,COALESCE(SUM(points_awarded),0)::int points FROM member_referrals WHERE member_id=$1::uuid AND created_at>=date_trunc('month',now())`,member.id)
  ]);
  const nextReward=rewards.find((r:any)=>Number(r.points_required)>balances.available)||rewards[0]||null;
  const minimumWithdrawal=await memberSetting("minimum_withdraw_points",30);
  return NextResponse.json({member:{name:rows[0].name,referralCode:rows[0].referral_code,referralUrl:`/r/${rows[0].referral_code}`},points:balances,referrals:referrals[0]||{total:0,rewarded:0},monthly:monthly[0]||{referrals:0,points:0},history,rewards,redemptions,withdrawals,notifications,ledger,minimumWithdrawal,progress:nextReward?{current:balances.available,target:Number(nextReward.points_required),reward:nextReward.name}:null});
}
