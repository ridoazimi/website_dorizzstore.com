import PortalPageClient from "../PortalPageClient";
import AvatarUploader from "./AvatarUploader";
import { prisma } from "@/lib/db";
import { getMember } from "@/lib/member";
import { redirect } from "next/navigation";

export default async function ProfilePage(){
  const session=await getMember();
  if(!session)redirect("/member");
  const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT name,avatar_url FROM members WHERE id=$1::uuid AND status='active' LIMIT 1`,session.id);
  const member=rows[0];
  return <div className="space-y-5"><section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-[0_10px_35px_rgba(37,99,235,.055)]"><p className="mb-4 text-xs font-black uppercase tracking-[.18em] text-blue-600">Foto Profil</p><AvatarUploader name={member?.name||"Member"} avatarUrl={member?.avatar_url||null}/></section><PortalPageClient section="profile"/></div>;
}
