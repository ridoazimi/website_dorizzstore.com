"use client";

import { useEffect, useMemo, useState } from "react";
import { Gift, Loader2, PackageSearch, Search } from "lucide-react";

const card = "rounded-xl border border-white/8 bg-white/[.025]";
const input = "w-full rounded-lg border border-white/10 bg-white/[.03] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent-primary)]";
const primary = "inline-flex items-center justify-center rounded-lg bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40";
const secondary = "inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[.03] px-4 py-2.5 text-sm font-semibold";

export default function AdminRewardsClient(){
  const [data,setData]=useState<any>({rewards:[],products:[]});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [type,setType]=useState("manual");
  const [productSearch,setProductSearch]=useState("");

  async function load(){
    setLoading(true);setError("");
    try{
      const r=await fetch("/api/admin/members/rewards",{cache:"no-store"});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||"Gagal memuat reward");
      setData(j);
    }catch(e:any){setError(e.message)}finally{setLoading(false)}
  }

  useEffect(()=>{void load()},[]);

  async function send(method:string,body:any){
    setNotice("");
    const r=await fetch("/api/admin/members/rewards",{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const j=await r.json();
    if(!r.ok){setNotice(j.error||"Gagal memproses reward");return false}
    setNotice("Perubahan berhasil disimpan.");
    await load();
    return true;
  }

  const products=useMemo(()=>{
    const q=productSearch.trim().toLowerCase();
    const rows=Array.isArray(data?.products)?data.products:[];
    return q?rows.filter((x:any)=>String(x.name||"").toLowerCase().includes(q)):rows;
  },[data?.products,productSearch]);

  if(loading)return <div className={`${card} grid min-h-48 place-items-center`}><Loader2 className="animate-spin"/></div>;
  if(error)return <div className={`${card} p-5 text-rose-300`}>{error}</div>;

  const rewards=Array.isArray(data?.rewards)?data.rewards:[];

  return <div className="space-y-5">
    <div>
      <h2 className="text-2xl font-black">Reward</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Kelola benefit Member dan mapping produk voucher tanpa memasukkan Product ID mentah.</p>
    </div>

    {notice&&<div className={`rounded-lg border px-4 py-3 text-sm ${notice.includes("berhasil")?"border-emerald-400/20 bg-emerald-400/10 text-emerald-300":"border-rose-400/20 bg-rose-400/10 text-rose-300"}`}>{notice}</div>}

    <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
      <form onSubmit={async e=>{
        e.preventDefault();
        const form=e.currentTarget;
        const f=new FormData(form);
        const ok=await send("POST",Object.fromEntries(f.entries()));
        if(ok){form.reset();setType("manual");setProductSearch("")}
      }} className={`${card} space-y-4 p-5`}>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]"><Gift size={19}/></div>
          <div><p className="font-bold">Tambah Reward</p><p className="text-xs text-[var(--text-muted)]">Buat benefit baru untuk Member.</p></div>
        </div>

        <input name="name" required className={input} placeholder="Nama reward"/>
        <input name="pointsRequired" type="number" min="1" required className={input} placeholder="Poin dibutuhkan"/>
        <select name="fulfillmentType" className={input} style={{colorScheme:"dark"}} value={type} onChange={e=>setType(e.target.value)}>
          <option value="manual">Manual</option>
          <option value="dorizz_voucher">Voucher Dorizz</option>
        </select>

        {type==="dorizz_voucher"&&<div className="space-y-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/>
            <input className={`${input} pl-9`} value={productSearch} onChange={e=>setProductSearch(e.target.value)} placeholder="Cari produk tujuan..."/>
          </div>
          <select name="productId" required className={input} style={{colorScheme:"dark"}} defaultValue="">
            <option value="">Pilih produk tujuan</option>
            {products.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <p className="text-xs text-[var(--text-muted)]">{products.length} produk aktif tersedia{productSearch?" dari hasil pencarian":""}.</p>
        </div>}

        <textarea name="description" className={`${input} min-h-24 resize-y`} placeholder="Deskripsi reward"/>
        <button className={`${primary} w-full`}>Tambah Reward</button>
      </form>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><div><p className="font-bold">Reward Tersedia</p><p className="text-xs text-[var(--text-muted)]">{rewards.length} reward terdaftar</p></div></div>
        {!rewards.length?<div className={`${card} grid min-h-40 place-items-center p-6 text-center`}><div><PackageSearch className="mx-auto mb-2 text-[var(--text-muted)]"/><p className="font-semibold">Belum ada reward</p></div></div>:rewards.map((r:any)=><div key={r.id} className={`${card} p-4`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold">{r.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.is_active?"bg-emerald-400/10 text-emerald-300":"bg-white/5 text-[var(--text-muted)]"}`}>{r.is_active?"Aktif":"Nonaktif"}</span>
              </div>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{r.points_required} poin • {r.fulfillment_type==="dorizz_voucher"?"Voucher Dorizz":"Manual"}{r.product_name?` • ${r.product_name}`:""}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{r.redemption_count} penukaran</p>
            </div>
            <button type="button" className={secondary} onClick={async()=>{
              const reason=window.prompt(`Alasan ${r.is_active?"menonaktifkan":"mengaktifkan"} reward`);
              if(reason)await send("PATCH",{id:r.id,isActive:!r.is_active,reason});
            }}>{r.is_active?"Nonaktifkan":"Aktifkan"}</button>
          </div>
        </div>)}
      </section>
    </div>
  </div>
}
