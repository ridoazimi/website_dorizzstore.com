import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateReferralCode, hashMemberPassword, normalizeEmail, normalizeWhatsapp, setMemberCookie, signMemberToken } from "@/lib/member";

export async function POST(req: NextRequest) {
  try {
    const { name, email, whatsapp, password, acceptTerms } = await req.json();
    if (!name || !email || !password || acceptTerms !== true) return NextResponse.json({ error: "Nama, email, password, dan persetujuan Syarat & Ketentuan wajib diisi" }, { status: 400 });
    if (String(password).length < 8) return NextResponse.json({ error: "Password minimal 8 karakter" }, { status: 400 });
    const normalizedEmail = normalizeEmail(email);
    const existing = await prisma.$queryRawUnsafe<any[]>(`SELECT id,status FROM members WHERE email=$1 LIMIT 1`, normalizedEmail);
    if (existing[0] && existing[0].status !== "left") return NextResponse.json({ error: "Email sudah terdaftar sebagai Member" }, { status: 409 });

    const hash = await hashMemberPassword(password);
    let member: any = null;
    for (let attempt=0; attempt<5 && !member; attempt++) {
      const code = generateReferralCode();
      try {
        if(existing[0]) {
          const rows=await prisma.$queryRawUnsafe<any[]>(`UPDATE members SET name=$2,whatsapp=$3,password=$4,referral_code=$5,status='active',joined_at=now(),left_at=NULL,updated_at=now() WHERE id=$1::uuid AND status='left' RETURNING id,name,email,referral_code`,existing[0].id,String(name).trim(),normalizeWhatsapp(whatsapp)||null,hash,code);
          member=rows[0];
        } else {
          const rows=await prisma.$queryRawUnsafe<any[]>(`INSERT INTO members(name,email,whatsapp,password,referral_code) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,referral_code`,String(name).trim(),normalizedEmail,normalizeWhatsapp(whatsapp)||null,hash,code);
          member=rows[0];
        }
      } catch (e:any) { if (attempt === 4) throw e; }
    }
    const settings=await prisma.$queryRawUnsafe<any[]>(`SELECT value FROM member_settings WHERE key='terms_version' LIMIT 1`);
    const version=String(settings[0]?.value??"1").replace(/^"|"$/g,"");
    await prisma.$executeRawUnsafe(`INSERT INTO member_terms_acceptances(member_id,terms_version,ip_address,user_agent) VALUES($1::uuid,$2,$3,$4) ON CONFLICT(member_id,terms_version) DO UPDATE SET accepted_at=now(),ip_address=EXCLUDED.ip_address,user_agent=EXCLUDED.user_agent`,member.id,version,req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||null,req.headers.get("user-agent")||null);
    const token=await signMemberToken({id:member.id,email:member.email,name:member.name,role:"member"});
    await setMemberCookie(token);
    return NextResponse.json({success:true,rejoined:Boolean(existing[0]),member:{id:member.id,name:member.name,referralCode:member.referral_code}});
  } catch(error){console.error("Member join error",error);return NextResponse.json({error:"Gagal bergabung sebagai Member"},{status:500});}
}
