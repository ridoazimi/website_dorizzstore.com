"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BadgeDollarSign,
  Gift,
  Loader2,
  Medal,
  Search,
  Settings2,
  Sparkles,
  UserMinus,
  Users,
  WalletCards,
} from "lucide-react";

const panel = "rounded-3xl border border-white/10 bg-white/[0.035] shadow-[0_18px_60px_rgba(0,0,0,.18)]";
const input = "rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none transition focus:border-cyan-400/40 focus:bg-white/[0.06]";
const button = "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm font-semibold transition hover:bg-white/[0.07]";
const primary = "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:brightness-110";

type Tab = "members" | "rewards" | "redemptions" | "withdrawals" | "leaderboard" | "settings" | "activity";

const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode; url: string }> = [
  { key: "members", label: "Member", icon: <Users size={16} />, url: "/api/admin/members" },
  { key: "rewards", label: "Reward", icon: <Gift size={16} />, url: "/api/admin/members/rewards" },
  { key: "redemptions", label: "Redemption", icon: <Sparkles size={16} />, url: "/api/admin/members/redemptions" },
  { key: "withdrawals", label: "Withdrawal", icon: <WalletCards size={16} />, url: "/api/admin/members/withdrawals" },
  { key: "leaderboard", label: "Leaderboard", icon: <Medal size={16} />, url: "/api/admin/members/leaderboard" },
  { key: "settings", label: "Settings", icon: <Settings2 size={16} />, url: "/api/admin/members/settings" },
  { key: "activity", label: "Activity Log", icon: <Activity size={16} />, url: "/api/admin/members/activity" },
];

export default function Page() {
  const [members, setMembers] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("members");
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/members?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      setMembers(await r.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  async function open(t: Tab, url: string) {
    setTab(t);
    if (t === "members") return void load();
    setLoading(true);
    try { setData(await fetch(url, { cache: "no-store" }).then(r => r.json())); }
    finally { setLoading(false); }
  }

  async function send(url: string, method: string, body: any) {
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) alert(j.error || "Gagal");
    else alert("Berhasil");
    await load();
    return j;
  }

  const stats = useMemo(() => {
    const active = members.filter(m => m.status === "active").length;
    const totalPoints = members.reduce((n, m) => n + Number(m.points || 0), 0);
    return { total: members.length, active, totalPoints };
  }, [members]);

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] px-5 py-7 text-[var(--text-primary)] md:px-8 md:py-9">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className={`${panel} overflow-hidden p-6 md:p-8`}>
          <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/15 bg-cyan-400/10 px-3 py-1.5 text-xs font-bold text-cyan-300"><Sparkles size={14}/> Member Operations</div>
              <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">Member Management</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">Kelola Member, reward, withdrawal, leaderboard, dan aktivitas admin dari satu tempat. Sales Creator tetap terpisah.</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Total Member" value={stats.total} />
              <Metric label="Member Aktif" value={stats.active} />
              <Metric label="Total Poin" value={stats.totalPoints} />
            </div>
          </div>
        </section>

        <section className={`${panel} p-3`}>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {tabs.map(item => (
              <button key={item.key} onClick={() => void open(item.key, item.url)} className={`flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition ${tab === item.key ? "bg-gradient-to-r from-cyan-400 to-indigo-500 text-slate-950" : "text-[var(--text-secondary)] hover:bg-white/[.05] hover:text-white"}`}>
                {item.icon}{item.label}
              </button>
            ))}
          </div>
        </section>

        {tab === "members" && (
          <section className="space-y-4">
            <div className={`${panel} p-4`}>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1"><Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void load(); }} placeholder="Cari nama atau email Member..." className={`${input} w-full pl-11`} /></div>
                <button onClick={() => void load()} className={primary}>{loading ? <Loader2 size={16} className="animate-spin"/> : <Search size={16}/>} Cari Member</button>
              </div>
            </div>
            {!members.length && !loading ? <Empty title="Belum ada Member" text="Member yang bergabung akan muncul di sini." /> : <div className="grid gap-4 xl:grid-cols-2">{members.map(m => <MemberCard key={m.id} member={m} send={send} />)}</div>}
          </section>
        )}

        {loading && tab !== "members" && <div className={`${panel} grid min-h-48 place-items-center`}><div className="flex items-center gap-2 text-sm text-[var(--text-muted)]"><Loader2 className="animate-spin" size={18}/> Memuat data Member...</div></div>}
        {!loading && tab === "rewards" && <Rewards data={data} send={send} reload={() => open("rewards", "/api/admin/members/rewards")} />}
        {!loading && tab === "redemptions" && <RequestTable rows={data} kind="redemption" send={send} reload={() => open("redemptions", "/api/admin/members/redemptions")} />}
        {!loading && tab === "withdrawals" && <RequestTable rows={data} kind="withdrawal" send={send} reload={() => open("withdrawals", "/api/admin/members/withdrawals")} />}
        {!loading && tab === "leaderboard" && <Leaderboard data={data} send={send} reload={() => open("leaderboard", "/api/admin/members/leaderboard")} />}
        {!loading && tab === "settings" && <Settings data={data} send={send} reload={() => open("settings", "/api/admin/members/settings")} />}
        {!loading && tab === "activity" && <ActivityLog data={data} />}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: any }) { return <div className="min-w-[110px] rounded-2xl border border-white/10 bg-white/[.035] px-4 py-3"><p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>; }

function MemberCard({ member: m, send }: any) {
  const active = m.status === "active";
  return <div className={`${panel} p-5 transition hover:border-cyan-400/20`}><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400/20 to-indigo-500/20 text-lg font-black text-cyan-300">{String(m.name || "M").slice(0,1).toUpperCase()}</div><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black">{m.name}</h3><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${active ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-400/10 text-slate-400"}`}>{m.status}</span></div><p className="mt-1 text-sm text-[var(--text-muted)]">{m.email}</p><p className="mt-1 font-mono text-xs text-cyan-300">Referral {m.referral_code}</p></div></div><div className="text-left sm:text-right"><p className="text-xs text-[var(--text-muted)]">Saldo poin</p><p className="text-2xl font-black">{m.points} <span className="text-sm font-semibold text-[var(--text-muted)]">poin</span></p></div></div><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => { const p=prompt("Koreksi poin (+/-)"); const reason=prompt("Alasan koreksi"); if(p&&reason) void send("/api/admin/members/points","POST",{memberId:m.id,points:Number(p),reason}); }} className={button}><BadgeDollarSign size={15}/> Koreksi poin</button>{active&&<button onClick={() => { const reason=prompt("Alasan Member keluar"); if(reason) void send("/api/admin/members","PATCH",{memberId:m.id,status:"left",reason}); }} className={`${button} hover:border-rose-400/20 hover:text-rose-300`}><UserMinus size={15}/> Keluarkan Member</button>}</div></div>;
}

function Rewards({ data, send, reload }: any) {
  const rewards = Array.isArray(data) ? data : [];
  return <section className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]"><form onSubmit={async e => { e.preventDefault(); const b=Object.fromEntries(new FormData(e.currentTarget).entries()); await send("/api/admin/members/rewards","POST",b); await reload(); }} className={`${panel} h-fit space-y-3 p-5`}><div><h2 className="text-xl font-black">Tambah Reward</h2><p className="text-sm text-[var(--text-muted)]">Reward tidak mengambil stok langsung.</p></div><input name="name" required placeholder="Nama reward" className={`${input} w-full`} /><input name="pointsRequired" type="number" min="1" required placeholder="Kebutuhan poin" className={`${input} w-full`} /><select name="fulfillmentType" className={`${input} w-full`}><option value="manual">Manual</option><option value="dorizz_voucher">Voucher Dorizz</option></select><input name="productId" placeholder="Product ID jika voucher Dorizz" className={`${input} w-full`} /><textarea name="description" placeholder="Deskripsi reward" className={`${input} min-h-24 w-full`} /><button className={`${primary} w-full`}><Gift size={16}/> Tambah reward</button></form><div className="grid gap-4">{!rewards.length ? <Empty title="Belum ada reward" text="Buat reward pertama untuk Member."/> : rewards.map((r:any)=><div key={r.id} className={`${panel} p-5`}><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-black">{r.name}</h3><p className="mt-1 text-sm text-[var(--text-muted)]">{r.description || "Tanpa deskripsi"}</p><p className="mt-3 font-bold text-cyan-300">{r.points_required} poin · {pretty(r.fulfillment_type)}</p></div><Status status={r.is_active ? "active" : "inactive"}/></div><button onClick={async()=>{const reason=prompt(`Alasan ${r.is_active?"menonaktifkan":"mengaktifkan"} reward`);await send("/api/admin/members/rewards","PATCH",{id:r.id,isActive:!r.is_active,reason:reason||null});await reload();}} className={`${button} mt-4`}>{r.is_active?"Nonaktifkan reward":"Aktifkan reward"}</button></div>)}</div></section>;
}

function RequestTable({ rows, kind, send, reload }: any) {
  if(!Array.isArray(rows)||!rows.length) return <Empty title={`Belum ada ${kind}`} text="Request baru akan muncul di sini." />;
  return <div className="grid gap-4 xl:grid-cols-2">{rows.map((x:any)=><div key={x.id} className={`${panel} p-5`}><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{kind}</p><h3 className="mt-1 text-lg font-black">{x.member_name}</h3><p className="mt-1 text-sm text-[var(--text-secondary)]">{kind==="redemption"?x.reward_name:`${x.points} poin`}</p></div><Status status={x.status}/></div>{x.status==="pending"&&<div className="mt-5 flex gap-2"><button onClick={async()=>{await send(`/api/admin/members/${kind==="redemption"?"redemptions":"withdrawals"}`,"PATCH",{id:x.id,decision:"approve",adminNotes:"Approved"});await reload();}} className={primary}>Approve</button><button onClick={async()=>{const reason=prompt("Alasan penolakan");if(reason){await send(`/api/admin/members/${kind==="redemption"?"redemptions":"withdrawals"}`,"PATCH",{id:x.id,decision:"reject",rejectionReason:reason});await reload();}}} className={button}>Reject</button></div>}</div>)}</div>;
}

function Leaderboard({ data, send, reload }: any) { const ranks=Array.from({length:10},(_,i)=>i+1); return <section className="space-y-5"><form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const prizes=ranks.map(rank=>({rank,prizeName:String(f.get(`p${rank}`)||"")})).filter(p=>p.prizeName);await send("/api/admin/members/leaderboard","POST",{name:f.get("name"),monthStart:f.get("monthStart"),monthEnd:f.get("monthEnd"),prizes});await reload();}} className={`${panel} grid gap-3 p-5 md:grid-cols-3`}><div className="md:col-span-3"><h2 className="text-xl font-black">Buat campaign leaderboard</h2><p className="text-sm text-[var(--text-muted)]">Hadiah Top 1–10 bersifat tambahan dan tidak memotong poin Member.</p></div><input name="name" required placeholder="Nama campaign" className={input}/><input name="monthStart" type="date" required className={input}/><input name="monthEnd" type="date" required className={input}/>{ranks.map(i=><input key={i} name={`p${i}`} placeholder={`Hadiah Top ${i} (opsional)`} className={input}/>)}<button className={`${primary} md:col-span-3`}><Medal size={16}/> Buat campaign</button></form><div className="grid gap-5 xl:grid-cols-2"><CardGrid rows={data?.campaigns} fields={["name","month_start","month_end","status"]}/><CardGrid rows={data?.prizes} fields={["rank","prize_name","notes"]}/></div></section>; }

function Settings({ data, send, reload }: any) { if(!Array.isArray(data)||!data.length)return <Empty title="Settings belum tersedia" text="Konfigurasi Member akan muncul di sini."/>; return <div className="grid gap-4 xl:grid-cols-2">{data.map((s:any)=><div key={s.key} className={`${panel} flex items-center justify-between gap-4 p-5`}><div><p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Member setting</p><h3 className="mt-1 font-black">{pretty(s.key)}</h3><p className="mt-2 text-sm text-cyan-300">{JSON.stringify(s.value)}</p></div><button onClick={async()=>{const value=prompt("Nilai baru",String(s.value));const reason=prompt("Alasan perubahan");if(value!==null){await send("/api/admin/members/settings","PATCH",{key:s.key,value:isNaN(Number(value))?value:Number(value),reason});await reload();}}} className={button}>Ubah</button></div>)}</div>; }

function ActivityLog({ data }: any) { return <CardGrid rows={data} fields={["action","member_name","admin_name","reason","created_at"]}/>; }
function CardGrid({ rows, fields }: any) { if(!Array.isArray(rows)||!rows.length)return <Empty title="Belum ada data" text="Data akan muncul ketika aktivitas tersedia."/>; return <div className="grid gap-4">{rows.map((x:any,i:number)=><div key={x.id||i} className={`${panel} p-5`}><div className="grid gap-4 sm:grid-cols-2">{fields.map((f:string)=><div key={f}><p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{pretty(f)}</p><p className="mt-1 font-bold">{x[f]===null||x[f]===undefined?"-":String(x[f])}</p></div>)}</div></div>)}</div>; }
function Empty({ title, text }: { title:string; text:string }) { return <div className={`${panel} grid min-h-48 place-items-center p-8 text-center`}><div><div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white/[.05] text-cyan-300"><Users size={20}/></div><h3 className="font-black">{title}</h3><p className="mt-1 text-sm text-[var(--text-muted)]">{text}</p></div></div>; }
function Status({status}:{status:string}) { const tone=status==="approved"||status==="completed"||status==="active"?"bg-emerald-400/10 text-emerald-300":status==="rejected"||status==="inactive"?"bg-rose-400/10 text-rose-300":"bg-amber-400/10 text-amber-300"; return <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${tone}`}>{status}</span>; }
function pretty(v:string){return v.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());}
