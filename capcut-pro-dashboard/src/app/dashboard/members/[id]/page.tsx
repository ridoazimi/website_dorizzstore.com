"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, Bell, FileCheck2, Gift, Loader2, Sparkles, Users, WalletCards } from "lucide-react";

const panel = "rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-[0_18px_60px_rgba(0,0,0,.18)]";

export default function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/members/${id}`, { cache: "no-store" })
      .then(async r => { const j=await r.json(); if(!r.ok) throw new Error(j.error||"Gagal memuat Member"); return j; })
      .then(setData).catch(e=>setError(e.message));
  }, [id]);

  if (error) return <main className="p-8 text-[var(--text-primary)]"><Link href="/dashboard/members">← Member</Link><p className="mt-6 text-rose-400">{error}</p></main>;
  if (!data) return <main className="grid min-h-[60vh] place-items-center text-[var(--text-muted)]"><Loader2 className="animate-spin"/></main>;

  const m=data.member;
  return <main className="min-h-screen bg-[var(--bg-primary)] px-5 py-7 text-[var(--text-primary)] md:px-8"><div className="mx-auto max-w-[1400px] space-y-6">
    <Link href="/dashboard/members" className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-cyan-300"><ArrowLeft size={16}/> Kembali ke Member</Link>
    <section className={panel}><div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between"><div><span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-300">{m.status}</span><h1 className="mt-4 text-3xl font-black">{m.name}</h1><p className="mt-1 text-sm text-[var(--text-muted)]">{m.email} · {m.whatsapp||"WhatsApp belum diisi"}</p><p className="mt-2 font-mono text-sm text-cyan-300">Referral {m.referral_code}</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Available" value={data.points.available}/><Metric label="Held" value={data.points.held}/><Metric label="Referral" value={data.referralSummary.total}/><Metric label="Rewarded" value={data.referralSummary.rewarded}/></div></div></section>
    <div className="grid gap-5 xl:grid-cols-2">
      <Section icon={<Users size={18}/>} title="Referral Tracking" rows={data.referrals} fields={["customer_name","transaction_status","points_awarded","is_new_customer","is_self_referral","created_at"]}/>
      <Section icon={<Sparkles size={18}/>} title="Point Ledger" rows={data.ledger} fields={["source_type","points","status","note","created_at"]}/>
      <Section icon={<Gift size={18}/>} title="Redemption" rows={data.redemptions} fields={["reward_name","points","status","voucher_code","rejection_reason","created_at"]}/>
      <Section icon={<WalletCards size={18}/>} title="Withdrawal" rows={data.withdrawals} fields={["points","amount_rupiah","method","status","rejection_reason","created_at"]}/>
      <Section icon={<Bell size={18}/>} title="Notification History" rows={data.notifications} fields={["title","message","is_read","created_at"]}/>
      <Section icon={<FileCheck2 size={18}/>} title="T&C Acceptance" rows={data.terms} fields={["terms_version","accepted_at","ip_address"]}/>
    </div>
  </div></main>;
}

function Metric({label,value}:{label:string;value:any}){return <div className="rounded-2xl border border-white/10 bg-white/[.03] px-4 py-3"><p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>}
function Section({icon,title,rows,fields}:{icon:React.ReactNode;title:string;rows:any[];fields:string[]}){return <section className={panel}><div className="mb-4 flex items-center gap-2 text-cyan-300">{icon}<h2 className="font-black text-[var(--text-primary)]">{title}</h2></div>{!rows?.length?<p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-[var(--text-muted)]">Belum ada data.</p>:<div className="space-y-3">{rows.map((x:any,i:number)=><div key={x.id||i} className="rounded-2xl border border-white/5 bg-white/[.02] p-4"><div className="grid gap-3 sm:grid-cols-2">{fields.map(f=><div key={f}><p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{pretty(f)}</p><p className="mt-1 break-words text-sm font-semibold">{x[f]===null||x[f]===undefined?"-":String(x[f])}</p></div>)}</div></div>)}</div>}</section>}
function pretty(v:string){return v.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
