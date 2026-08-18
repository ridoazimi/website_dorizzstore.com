import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMember } from "@/lib/member";

export async function GET() {
  const m=await getMember(); if(!m) return NextResponse.json({error:"Unauthorized"},{status:401});
  const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT x.*,r.name reward_name FROM member_redemptions x JOIN member_rewards r ON r.id=x.reward_id WHERE x.member_id=$1::uuid ORDER BY x.created_at DESC`,m.id);
  return NextResponse.json(rows);
}

export async function POST(req:Request) {
  const m=await getMember(); if(!m) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {rewardId}=await req.json();
  if(!rewardId) return NextResponse.json({error:"Reward wajib dipilih"},{status:400});
  try {
    const rows=await prisma.$queryRawUnsafe<Array<{id:string}>>(`SELECT reserve_member_redemption($1::uuid,$2::uuid)::text id`,m.id,rewardId);
    return NextResponse.json({success:true,id:rows[0].id,status:"pending"});
  } catch(e:any) {
    const message=String(e?.message||e);
    if(message.includes("REWARD_NOT_AVAILABLE")) return NextResponse.json({error:"Reward tidak tersedia"},{status:404});
    if(message.includes("INSUFFICIENT_POINTS")) return NextResponse.json({error:"Poin belum cukup"},{status:400});
    if(message.includes("MEMBER_INACTIVE")) return NextResponse.json({error:"Member tidak aktif"},{status:403});
    console.error("Member redemption error",e);
    return NextResponse.json({error:"Gagal membuat redemption"},{status:500});
  }
}
