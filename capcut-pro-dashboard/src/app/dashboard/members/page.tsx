"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ArrowRight, Menu } from "lucide-react";
import { useMobileNav } from "@/context/MobileNavContext";
import AdminMemberNav from "./AdminMemberNav";

const card="rounded-xl border border-white/8 bg-white/[.025]";
const fmt=(v:any)=>new Intl.NumberFormat("id-ID").format(Number(v||0));

export default function Page(){
  const { open }=useMobileNav();
  const [data,setData]=useState<any>(null);const [error,setError]=useState("");
  useEffect(()=>{fetch("/api/admin/members/overview",{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||"Gagal memuat overview");return j}).then(setData).catch(e=>setError(e.message))},[]);
  return <main className="min-h-screen bg-[var(--bg-primary)] px-4 py-6 text-[var(--text-primary)] md:px-6 lg:px-8"><div className="mx-auto max-w-[1500px] space-y-5">
    <div className="flex items-start gap-3"><button onClick={open} className="btn-icon mt-0.5 shrink-0 lg:hidden" aria-label="Buka menu"><Menu size={18}/></button><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--accent-primary)]">Member Operations</p><h1 className="mt-1 text-3xl font-black">Member</h1><p className="mt-2 text-sm text-[var(--text-muted)]">Kelola loyalty, referral, reward, withdrawal, dan operasional Member dari dashboard DorizzStore.</p></div></div>
    <AdminMemberNav/>
    {error?<div className={`${card} p-5 text-rose-300`}>{error}</div>:!data?<div className={`${card} grid min-h-48 place-items-center`}><Loader2 className="animate-spin"/></div>:<>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Total Member" value={data.kpi.total_members}/><Metric label="Member Aktif" value={data.kpi.active_members}/><Metric label="Member Baru Bulan Ini" value={data.kpi.new_members_month}/><Metric label="Referral Sukses Bulan Ini" value={data.kpi.successful_referrals_month}/><Metric label="Point Liability" value={`Rp ${fmt(data.kpi.point_liability_rupiah)}`}/></section>
      <section className="grid gap-4 xl:grid-cols-3"><Queue title="Perlu Diproses" rows={[{label:"Pending Redemption",value:data.kpi.pending_redemptions,href:"/dashboard/members/redemptions"},{label:"Pending Withdrawal",value:data.kpi.pending_withdrawals,href:"/dashboard/members/withdrawals"}]}/><SimpleList title="Top Referrer Bulan Ini" rows={data.topReferrers.map((x:any)=>({title:x.name,sub:`${x.referrals} referral • ${x.points} poin`}))}/><SimpleList title="Reward Terpopuler" rows={data.popularRewards.map((x:any)=>({title:x.name,sub:`${x.redemptions} penukaran`}))}/></section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Poin Issued" value={data.kpi.points_issued}/><Metric label="Poin Available" value={data.kpi.points_available}/><Metric label="Poin Held" value={data.kpi.points_held}/><Metric label="Total Pending" value={Number(data.kpi.pending_redemptions||0)+Number(data.kpi.pending_withdrawals||0)}/></section>
    </>}
  </div></main>
}
function Metric({label,value}:{label:string;value:any}){return <div className={`${card} p-4`}><p className="text-xs text-[var(--text-muted)]">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>}
function Queue({title,rows}:{title:string;rows:any[]}){return <div className={`${card} p-5`}><h2 className="font-black">{title}</h2><div className="mt-4 space-y-2">{rows.map(x=><Link key={x.label} href={x.href} className="flex items-center justify-between rounded-lg border border-white/6 p-3 hover:bg-white/[.03]"><span className="text-sm">{x.label}</span><span className="flex items-center gap-2 font-black">{x.value}<ArrowRight size={14}/></span></Link>)}</div></div>}
function SimpleList({title,rows}:{title:string;rows:any[]}){return <div className={`${card} p-5`}><h2 className="font-black">{title}</h2><div className="mt-4 space-y-3">{rows.length?rows.map((x,i)=><div key={i} className="border-b border-white/6 pb-3 last:border-0"><p className="text-sm font-semibold">{x.title}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{x.sub}</p></div>):<p className="text-sm text-[var(--text-muted)]">Belum ada data.</p>}</div></div>}
