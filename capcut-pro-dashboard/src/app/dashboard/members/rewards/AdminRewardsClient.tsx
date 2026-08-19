"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Gift, Loader2, PackageCheck, PackageSearch, Search, Sparkles } from "lucide-react";

const card = "rounded-2xl border border-white/8 bg-white/[.025]";
const input = "w-full rounded-xl border border-white/10 bg-white/[.03] px-3.5 py-3 text-sm text-white outline-none transition focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/10";
const primary = "inline-flex items-center justify-center rounded-xl bg-[var(--accent-primary)] px-4 py-3 text-sm font-black text-white transition hover:brightness-110 disabled:opacity-40";
const secondary = "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 text-sm font-semibold transition hover:bg-white/[.06]";

export default function AdminRewardsClient(){
  const [data,setData]=useState<any>({rewards:[],products:[]});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [type,setType]=useState("manual");
  const [productSearch,setProductSearch]=useState("");
  const [selectedProduct,setSelectedProduct]=useState<any>(null);
  const [productOpen,setProductOpen]=useState(false);
  const [rewardFilter,setRewardFilter]=useState("all");
  const pickerRef=useRef<HTMLDivElement>(null);

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
  useEffect(()=>{
    const close=(e:MouseEvent)=>{if(pickerRef.current&&!pickerRef.current.contains(e.target as Node))setProductOpen(false)};
    document.addEventListener("mousedown",close);
    return()=>document.removeEventListener("mousedown",close);
  },[]);

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

  const rewards=Array.isArray(data?.rewards)?data.rewards:[];
  const activeRewards=rewards.filter((r:any)=>r.is_active).length;
  const voucherRewards=rewards.filter((r:any)=>r.fulfillment_type==="dorizz_voucher").length;
  const totalRedemptions=rewards.reduce((sum:number,r:any)=>sum+Number(r.redemption_count||0),0);
  const filteredRewards=rewardFilter==="all"?rewards:rewards.filter((r:any)=>rewardFilter==="active"?r.is_active:!r.is_active);

  if(loading)return <div className={`${card} grid min-h-48 place-items-center`}><Loader2 className="animate-spin"/></div>;
  if(error)return <div className={`${card} p-5 text-rose-300`}>{error}</div>;

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/10 px-3 py-1 text-xs font-black text-[var(--accent-primary)]"><Sparkles size={13}/> Reward Management</div>
        <h2 className="text-2xl font-black">Reward Member</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Buat benefit Member, hubungkan ke produk Dorizz, dan pantau performanya dari satu halaman.</p>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className={`${card} p-4`}><p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Reward Aktif</p><p className="mt-2 text-2xl font-black">{activeRewards}</p><p className="mt-1 text-xs text-[var(--text-muted)]">dari {rewards.length} reward</p></div>
      <div className={`${card} p-4`}><p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Voucher Dorizz</p><p className="mt-2 text-2xl font-black">{voucherRewards}</p><p className="mt-1 text-xs text-[var(--text-muted)]">reward terhubung produk</p></div>
      <div className={`${card} p-4`}><p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Total Penukaran</p><p className="mt-2 text-2xl font-black">{totalRedemptions}</p><p className="mt-1 text-xs text-[var(--text-muted)]">seluruh reward</p></div>
    </div>

    {notice&&<div className={`rounded-xl border px-4 py-3 text-sm ${notice.includes("berhasil")?"border-emerald-400/20 bg-emerald-400/10 text-emerald-300":"border-rose-400/20 bg-rose-400/10 text-rose-300"}`}>{notice}</div>}

    <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
      <form onSubmit={async e=>{
        e.preventDefault();
        const form=e.currentTarget;
        const f=new FormData(form);
        if(type==="dorizz_voucher"&&!selectedProduct){setNotice("Pilih produk tujuan untuk Voucher Dorizz.");return}
        const payload:any=Object.fromEntries(f.entries());
        payload.fulfillmentType=type;
        payload.productId=type==="dorizz_voucher"?selectedProduct?.id||"":"";
        const ok=await send("POST",payload);
        if(ok){form.reset();setType("manual");setProductSearch("");setSelectedProduct(null);setProductOpen(false)}
      }} className={`${card} overflow-visible p-5`}>
        <div className="flex items-center gap-3 border-b border-white/8 pb-4">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]"><Gift size={20}/></div>
          <div><p className="font-black">Tambah Reward Baru</p><p className="text-xs text-[var(--text-muted)]">Atur nama, kebutuhan poin, dan benefit reward.</p></div>
        </div>

        <div className="mt-4 space-y-4">
          <div><label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)]">Nama reward</label><input name="name" required className={input} placeholder="Contoh: Gratis CapCut Pro 1 Bulan"/></div>
          <div><label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)]">Poin dibutuhkan</label><input name="pointsRequired" type="number" min="1" required className={input} placeholder="Contoh: 15"/></div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)]">Jenis reward</label>
            <input type="hidden" name="fulfillmentType" value={type}/>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/8 bg-[#0b111b] p-1.5">
              <button type="button" onClick={()=>{setType("manual");setSelectedProduct(null);setProductSearch("");setProductOpen(false)}} className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${type==="manual"?"bg-white/10 text-white shadow-sm":"text-[var(--text-muted)] hover:bg-white/[.05] hover:text-white"}`}>Manual</button>
              <button type="button" onClick={()=>{setType("dorizz_voucher");setSelectedProduct(null);setProductSearch("");setProductOpen(false)}} className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${type==="dorizz_voucher"?"bg-[var(--accent-primary)] text-white shadow-[0_0_18px_rgba(32,213,210,.16)]":"text-[var(--text-muted)] hover:bg-white/[.05] hover:text-white"}`}>Voucher Dorizz</button>
            </div>
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">{type==="manual"?"Reward diproses manual oleh admin.":"Reward otomatis diarahkan ke produk Dorizz yang dipilih."}</p>
          </div>

          {type==="dorizz_voucher"&&<div className="space-y-2" ref={pickerRef}>
            <label className="block text-xs font-bold text-[var(--text-secondary)]">Produk tujuan</label>
            <div className="relative">
              <button type="button" onClick={()=>setProductOpen(v=>!v)} className={`${input} flex items-center justify-between text-left`}>
                <span className={selectedProduct?"text-white":"text-[var(--text-muted)]"}>{selectedProduct?.name||"Pilih produk tujuan"}</span>
                <ChevronDown size={17} className={`shrink-0 transition ${productOpen?"rotate-180":""}`}/>
              </button>
              {productOpen&&<div className="absolute z-[80] mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-[#101722] shadow-2xl">
                <div className="border-b border-white/8 p-2">
                  <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/><input autoFocus className="w-full rounded-lg border border-white/8 bg-[#0b111b] py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-[var(--accent-primary)]" value={productSearch} onChange={e=>setProductSearch(e.target.value)} placeholder="Cari produk..."/></div>
                </div>
                <div className="max-h-64 overflow-y-auto p-1.5">
                  {!products.length?<div className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">Produk tidak ditemukan.</div>:products.map((x:any)=><button key={x.id} type="button" onClick={()=>{setSelectedProduct(x);setProductOpen(false)}} className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/[.07]">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[.03]">{selectedProduct?.id===x.id?<Check size={13} className="text-[var(--accent-primary)]"/>:null}</span>
                    <span className="leading-5">{x.name}</span>
                  </button>)}
                </div>
              </div>}
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]"><span>{products.length} produk aktif tersedia</span>{selectedProduct&&<button type="button" onClick={()=>setSelectedProduct(null)} className="font-semibold text-rose-300 hover:text-rose-200">Hapus pilihan</button>}</div>
          </div>}

          <div><label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)]">Deskripsi</label><textarea name="description" className={`${input} min-h-24 resize-y`} placeholder="Jelaskan benefit yang diterima Member"/></div>
          <button className={`${primary} w-full`}><Gift size={16} className="mr-2"/>Tambah Reward</button>
        </div>
      </form>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-black">Reward Tersedia</p><p className="text-xs text-[var(--text-muted)]">Kelola reward aktif maupun nonaktif.</p></div>
          <div className="flex rounded-xl border border-white/8 bg-white/[.025] p-1 text-xs font-bold">
            {[['all','Semua'],['active','Aktif'],['inactive','Nonaktif']].map(([v,l])=><button key={v} type="button" onClick={()=>setRewardFilter(v)} className={`rounded-lg px-3 py-2 transition ${rewardFilter===v?"bg-white/10 text-white":"text-[var(--text-muted)] hover:text-white"}`}>{l}</button>)}
          </div>
        </div>

        {!filteredRewards.length?<div className={`${card} grid min-h-44 place-items-center p-6 text-center`}><div><PackageSearch className="mx-auto mb-2 text-[var(--text-muted)]"/><p className="font-semibold">Tidak ada reward</p><p className="mt-1 text-xs text-[var(--text-muted)]">Belum ada reward pada filter ini.</p></div></div>:filteredRewards.map((r:any)=><div key={r.id} className={`${card} p-4 transition hover:border-white/15 hover:bg-white/[.035]`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[.05] text-[var(--accent-primary)]"><PackageCheck size={16}/></div>
                <p className="font-black">{r.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${r.is_active?"bg-emerald-400/10 text-emerald-300":"bg-white/5 text-[var(--text-muted)]"}`}>{r.is_active?"Aktif":"Nonaktif"}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-lg bg-white/[.04] px-2.5 py-1.5 font-bold">{r.points_required} poin</span>
                <span className="rounded-lg bg-white/[.04] px-2.5 py-1.5">{r.fulfillment_type==="dorizz_voucher"?"Voucher Dorizz":"Manual"}</span>
                <span className="rounded-lg bg-white/[.04] px-2.5 py-1.5">{r.redemption_count} penukaran</span>
              </div>
              {r.product_name&&<p className="mt-3 text-sm leading-5 text-[var(--text-secondary)]">Produk: <span className="font-semibold text-white">{r.product_name}</span></p>}
              {r.description&&<p className="mt-2 text-sm leading-5 text-[var(--text-muted)]">{r.description}</p>}
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
