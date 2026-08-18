import { notFound } from "next/navigation";
import AdminMemberNav from "../AdminMemberNav";
import AdminMemberSectionClient, { type AdminSection } from "../AdminMemberSectionClient";

const sections: AdminSection[]=["list","rewards","redemptions","withdrawals","leaderboard","points","settings","activity"];

export default async function Page({params}:{params:Promise<{section:string}>}){
  const {section}=await params;
  if(!sections.includes(section as AdminSection)) notFound();
  return <main className="min-h-screen bg-[var(--bg-primary)] px-4 py-6 text-[var(--text-primary)] md:px-6 lg:px-8"><div className="mx-auto max-w-[1500px] space-y-5"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--accent-primary)]">Member Operations</p><h1 className="mt-1 text-3xl font-black">Member</h1><p className="mt-2 text-sm text-[var(--text-muted)]">Operasional Member terintegrasi dengan dashboard admin DorizzStore.</p></div><AdminMemberNav/><AdminMemberSectionClient section={section as AdminSection}/></div></main>
}
