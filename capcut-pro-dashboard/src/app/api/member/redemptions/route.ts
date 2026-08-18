import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMember, getMemberBalances } from "@/lib/member";
export async function GET() {
  const m=await getMember(); if(!m) return NextResponse.json({error:"Unauthorized"},{status:401});
  const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT x.*,r.name reward_name FROM member_redemptions x JOIN member_rewards r ON r.id=x.reward_id WHERE x.member_id=$1::uuid ORDER BY x.created_at DESC`,m.id); return NextResponse.json(rows);
}
export async function POST(req:Request) {
  const m=await getMember(); if(!m) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {rewardId}=await req.json(); const rewards=await prisma.$queryRawUnsafe<any[]>(`SELECT id,name,points_required,is_active FROM member_rewards WHERE id=$1::uuid`,rewardId); const reward=rewards[0];
  if(!reward||!reward.is_active) return NextResponse.json({error:"Reward tidak tersedia"},{status:404});
  const balance=await getMemberBalances(m.id); const points=Number(reward.points_required); if(balance.available<points) return NextResponse.json({error:"Poin belum cukup"},{status:400});
  const rows=await prisma.$queryRawUnsafe<any[]>(`INSERT INTO member_redemptions(member_id,reward_id,points) VALUES($1::uuid,$2::uuid,$3) RETURNING id`,m.id,rewardId,points); const id=rows[0].id;
  await prisma.$executeRawUnsafe(`INSERT INTO member_point_ledger(member_id,source_type,source_id,points,status,note) VALUES($1::uuid,'reward_redemption',$2::uuid,$3,'available',$4),($1::uuid,'reward_redemption_hold',$2::uuid,$5,'held',$4)`,m.id,id,-points,`Hold redeem ${reward.name}`,points);
  return NextResponse.json({success:true,id,status:"pending"});
}
