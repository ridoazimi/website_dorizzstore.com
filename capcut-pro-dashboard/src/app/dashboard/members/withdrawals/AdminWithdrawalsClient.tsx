"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, CheckCircle2, Clock3, Loader2, Search, ShieldCheck, WalletCards, XCircle } from "lucide-react";

const card = "rounded-2xl border border-white/8 bg-white/[.025]";
const input = "w-full rounded-xl border border-white/10 bg-white/[.03] px-3.5 py-3 text-sm text-white outline-none transition focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/10";
const primary = "inline-flex items-center justify-center rounded-xl bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40";
const secondary = "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 text-sm font-semibold transition hover:bg-white/[.06] disabled:cursor-not-allowed disabled:opacity-40";
const money=(v:any)=>new Intl.NumberFormat("id-ID").format(Number(v||0));
const date=(v:any)=>new Date(v).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"});

function statusMeta(status:string){
  if(status==="pending")return {label:"Pending",cls:"border-amber-400/20 bg-amber-400/10 text-amber-300",icon:Clock3};
  if(status==="approved")return {label:"Approved",cls:"border-emerald-400/20 bg-emerald-400/10 text-emerald-300",icon:CheckCircle2};
  if(status==="rejected")return {label:"Rejected",cls:"border-rose-400/20 bg-rose-400/10 text-rose-300",icon:XCircle};
  return {label:status||"Unknown",cls:"border-white/10 bg-white/5 text-slate-300",icon:Clock3};
}

export default function AdminWithdrawalsClient(){
  const [rows,setRows]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [q,setQ]=useState("");
  const [filter,setFilter]=useState("all");

  async function load(){
    setLoading(true);setError("");
    try{
      const r=await fetch("/api/admin/members/withdrawals",{cache:"no-store"});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||"Gagal memuat withdrawal");
      setRows(Array.isArray(j)?j:[]);
    }catch(e:any){setError(e.message)}finally{setLoading(false)}
  }

  useEffect(()=>{void load()},[]);

  async function decide(id:string,decision:"approve"|"reject",reason:string){
    setNotice("");
    const r=await fetch("/api/admin/members/withdrawals",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(decision==="approve"?{id,decision,adminNotes:reason||"Approved"}:{id,decision,rejectionReason:reason})});
    const j=await r.json();
    if(!r.ok){setNotice(j.error||"Gagal memproses withdrawal");return false}
    setNotice(decision==="approve"?"Withdrawal berhasil disetujui.":"Withdrawal berhasil ditolak.");
    await load();
    return true;
  }

  const stats=useMemo(()=>({
    pending:rows.filter(x=>x.status==="pending").length,
    approved:rows.filter(x=>x.status==="approved").length,
    rejected:rows.filter(x=>x.status==="rejected").length,
    pendingAmount:rows.filter(x=>x.status==="pending").reduce((s,x)=>s+Number(x.amount_rupiah||0),0),
  }),[rows]);

  const filtered=useMemo(()=>{
    const term=q.trim().toLowerCase();
    return rows.filter(x=>{
      const statusOk=filter==="all"||x.status===filter;
      const text=[x.member_name,x.method,x.account_name,x.account_number].join(" ").toLowerCase();
      return statusOk&&(!term||text.includes(term));
    });
  },[rows,q,filter]);

  if(loading)return <div className={`${card} grid min-h-48 place-items-center`}><Loader2 className="animate-spin"/></div>;
  if(error)return <div className={`${card} p-5 text-rose-300`}>{error}</div>;

  return <div className="space-y-5">
    <div>
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/10 px-3 py-1 text-xs font-black text-[var(--accent-primary)]"><WalletCards size={13}/> Withdrawal Operations</div>
      <h2 className="text-2xl font-black">Withdrawal Member</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Review pengajuan pencairan poin, cek rekening tujuan, lalu approve atau reject dengan jejak audit.</p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Menunggu Proses" value={stats.pending} sub={`Rp ${money(stats.pendingAmount)} perlu direview`} icon={Clock3}/>
      <Stat label="Approved" value={stats.approved} sub="pengajuan disetujui" icon={CheckCircle2}/>
      <Stat label="Rejected" value={stats.rejected} sub="pengajuan ditolak" icon={XCircle}/>
      <Stat label="Total Request" value={rows.length} sub="seluruh riwayat withdrawal" icon={Banknote}/>
    </div>

    {notice&&<div className={`rounded-xl border px-4 py-3 text-sm ${notice.includes("berhasil")?"border-emerald-400/20 bg-emerald-400/10 text-emerald-300":"border-rose-400/20 bg-rose-400/10 text-rose-300"}`}>{notice}</div>}

    <div className={`${card} flex flex-col gap-3 p-3 lg:flex-row lg:items-center`}>
      <div className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/><input className={`${input} pl-9`} value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari nama member, metode, nama rekening, atau nomor akun"/></div>
      <div className="flex flex-wrap rounded-xl border border-white/8 bg-[#0b111b] p-1 text-xs font-bold">
        {[['all','Semua'],['pending','Pending'],['approved','Approved'],['rejected','Rejected']].map(([v,l])=><button key={v} type="button" onClick={()=>setFilter(v)} className={`rounded-lg px-3 py-2 transition ${filter===v?"bg-white/10 text-white":"text-[var(--text-muted)] hover:text-white"}`}>{l}</button>)}
      </div>
    </div>

    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3"><div><p className="font-black">Daftar Withdrawal</p><p className="mt-1 text-xs text-[var(--text-muted)]">{filtered.length} request ditampilkan</p></div>{stats.pending>0&&<span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-300">{stats.pending} perlu tindakan</span>}</div>
      {!filtered.length?<div className={`${card} grid min-h-44 place-items-center p-6 text-center`}><div><ShieldCheck className="mx-auto mb-2 text-[var(--text-muted)]"/><p className="font-semibold">Tidak ada withdrawal</p><p className="mt-1 text-xs text-[var(--text-muted)]">Tidak ada data yang cocok dengan filter saat ini.</p></div></div>:filtered.map(x=><WithdrawalCard key={x.id} x={x} decide={decide}/>)}
    </section>
  </div>
}

function Stat({label,value,sub,icon:Icon}:{label:string;value:number;sub:string;icon:any}){return <div className={`${card} p-4`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</p><p className="mt-2 text-2xl font-black">{value}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{sub}</p></div><div className="grid h-9 w-9 place-items-center rounded-xl bg-white/[.05] text-[var(--accent-primary)]"><Icon size={17}/></div></div></div>}

function WithdrawalCard({x,decide}:{x:any;decide:any}){
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const meta=statusMeta(x.status);const Icon=meta.icon;
  const isPending=x.status==="pending";

  async function approve(){
    if(!window.confirm(`Setujui withdrawal ${x.member_name} sebesar Rp ${money(x.amount_rupiah)}?`))return;
    setBusy(true);await decide(x.id,"approve",reason);setBusy(false);
  }
  async function reject(){
    if(!reason.trim())return;
    if(!window.confirm(`Tolak withdrawal ${x.member_name}?`))return;
    setBusy(true);await decide(x.id,"reject",reason.trim());setBusy(false);
  }

  return <article className={`${card} overflow-hidden`}>
    <div className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-black text-white">{x.member_name}</p>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${meta.cls}`}><Icon size={12}/>{meta.label}</span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Diajukan {date(x.created_at)}</p>
        </div>
        <div className="xl:text-right"><p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Nominal Withdrawal</p><p className="mt-1 text-2xl font-black text-white">Rp {money(x.amount_rupiah)}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{x.points} poin</p></div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Detail label="Metode" value={String(x.method||'-').toUpperCase()}/>
        <Detail label="Nama Penerima" value={x.account_name||'-'}/>
        <Detail label="Nomor Tujuan" value={x.account_number||'-'} mono/>
      </div>

      {!isPending&&<div className="mt-4 grid gap-3 sm:grid-cols-2"><Detail label="Diproses" value={x.processed_at?date(x.processed_at):'-'}/><Detail label={x.status==="rejected"?"Alasan Reject":"Catatan Admin"} value={x.status==="rejected"?(x.rejection_reason||'-'):(x.admin_notes||'-')}/></div>}
    </div>

    {isPending&&<div className="border-t border-white/8 bg-white/[.015] p-4 sm:p-5">
      <p className="mb-2 text-xs font-bold text-[var(--text-secondary)]">Catatan approval / alasan reject</p>
      <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto]"><input className={input} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Opsional untuk approve, wajib untuk reject"/><button disabled={busy} className={primary} onClick={()=>void approve()}>{busy?<Loader2 size={15} className="mr-2 animate-spin"/>:<CheckCircle2 size={15} className="mr-2"/>}Approve</button><button disabled={busy||!reason.trim()} className={`${secondary} border-rose-400/20 text-rose-300 hover:bg-rose-400/10`} onClick={()=>void reject()}><XCircle size={15} className="mr-2"/>Reject</button></div>
    </div>}
  </article>
}

function Detail({label,value,mono=false}:{label:string;value:any;mono?:boolean}){return <div className="rounded-xl border border-white/6 bg-[#0b111b] px-3.5 py-3"><p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</p><p className={`mt-1 break-words text-sm font-semibold text-white ${mono?"font-mono tracking-wide":""}`}>{String(value)}</p></div>}
