import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMember, getMemberBalances, memberSetting } from "@/lib/member";
export async function GET(){const m=await getMember();if(!m)return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM member_withdrawals WHERE member_id=$1::uuid ORDER BY created_at DESC`,m.id));}
export async function POST(req:Request){
 const m=await getMember();if(!m)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {points,method,accountNumber,accountName}=await req.json();const p=Number(points);const minimum=await memberSetting("minimum_withdraw_points",30);const value=await memberSetting("point_value_rupiah",3000);
 if(!Number.isInteger(p)||p<minimum)return NextResponse.json({error:`Minimum withdrawal ${minimum} poin`},{status:400});if(!method||!accountNumber||!accountName)return NextResponse.json({error:"Data pencairan belum lengkap"},{status:400});
 const bal=await getMemberBalances(m.id);if(bal.available<p)return NextResponse.json({error:"Poin tersedia tidak cukup"},{status:400});
 const rows=await prisma.$queryRawUnsafe<any[]>(`INSERT INTO member_withdrawals(member_id,points,point_value_rupiah,amount_rupiah,method,account_number,account_name) VALUES($1::uuid,$2,$3,$4,$5,$6,$7) RETURNING id`,m.id,p,value,p*value,method,accountNumber,accountName);const id=rows[0].id;
 await prisma.$executeRawUnsafe(`INSERT INTO member_point_ledger(member_id,source_type,source_id,points,status,note) VALUES($1::uuid,'cash_withdrawal',$2::uuid,$3,'available','Hold cash withdrawal'),($1::uuid,'cash_withdrawal_hold',$2::uuid,$4,'held','Hold cash withdrawal')`,m.id,id,-p,p);
 return NextResponse.json({success:true,id,status:"pending",amountRupiah:p*value});
}
