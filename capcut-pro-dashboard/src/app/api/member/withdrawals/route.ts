import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMember, memberSetting } from "@/lib/member";

export async function GET(){
 const m=await getMember();if(!m)return NextResponse.json({error:"Unauthorized"},{status:401});
 return NextResponse.json(await prisma.$queryRawUnsafe<any[]>(`SELECT id,member_id,points,point_value_rupiah,amount_rupiah::text AS amount_rupiah,method,account_number,account_name,status,rejection_reason,admin_notes,created_at,processed_at,processed_by FROM member_withdrawals WHERE member_id=$1::uuid ORDER BY created_at DESC`,m.id));
}

export async function POST(req:Request){
 const m=await getMember();if(!m)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {points,method,accountNumber,accountName}=await req.json();
 const p=Number(points),minimum=await memberSetting("minimum_withdraw_points",30),value=await memberSetting("point_value_rupiah",3000);
 if(!Number.isInteger(p)||p<minimum)return NextResponse.json({error:`Minimum withdrawal ${minimum} poin`},{status:400});
 if(!method||!accountNumber||!accountName)return NextResponse.json({error:"Data pencairan belum lengkap"},{status:400});
 try {
  const rows=await prisma.$queryRawUnsafe<Array<{id:string}>>(`SELECT reserve_member_withdrawal($1::uuid,$2,$3,$4,$5,$6)::text id`,m.id,p,value,String(method),String(accountNumber),String(accountName));
  return NextResponse.json({success:true,id:rows[0].id,status:"pending",amountRupiah:p*value});
 } catch(e:any) {
  const message=String(e?.message||e);
  if(message.includes("INSUFFICIENT_POINTS"))return NextResponse.json({error:"Poin tersedia tidak cukup"},{status:400});
  if(message.includes("MEMBER_INACTIVE"))return NextResponse.json({error:"Member tidak aktif"},{status:403});
  console.error("Member withdrawal error",e);
  return NextResponse.json({error:"Gagal membuat withdrawal"},{status:500});
 }
}
