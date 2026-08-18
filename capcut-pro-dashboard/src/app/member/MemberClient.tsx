"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Copy,
  Gift,
  Loader2,
  LogIn,
  Medal,
  Share2,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
  WalletCards,
  Zap,
} from "lucide-react";

const panel = "rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl shadow-[0_20px_70px_rgba(0,0,0,.22)]";
const input = "w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3.5 text-sm outline-none transition focus:border-cyan-400/50 focus:bg-white/[0.065]";
const primary = "inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-indigo-500 px-5 py-3 font-bold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40";
const secondary = "inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-5 py-3 font-semibold text-white transition hover:bg-white/[0.065]";

export default function MemberClient() {
  const [data, setData] = useState<any>(null);
  const [mode, setMode] = useState<"join" | "login">("join");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy link");

  const load = async () => {
    try {
      const r = await fetch("/api/member/dashboard", { cache: "no-store" });
      setData(r.ok ? await r.json() : null);
    } catch {
      setData(null);
    }
  };

  useEffect(() => { void load(); }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const f = new FormData(e.currentTarget);
      const body: any = Object.fromEntries(f.entries());
      let url = "/api/member/auth/login";
      if (mode === "join") {
        url = "/api/member/auth/join";
        body.acceptTerms = f.get("acceptTerms") === "on";
      }
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || "Gagal memproses Member");
        return;
      }
      await load();
    } catch {
      setError("Terjadi gangguan. Coba lagi beberapa saat.");
    } finally {
      setLoading(false);
    }
  }

  async function redeem(id: string) {
    const r = await fetch("/api/member/redemptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rewardId: id }) });
    const j = await r.json();
    if (!r.ok) alert(j.error || "Gagal menukar reward");
    await load();
  }

  async function withdraw(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    const r = await fetch("/api/member/withdrawals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) alert(j.error || "Gagal mengajukan withdrawal");
    else form.reset();
    await load();
  }

  if (!data) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#050914] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.18),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(99,102,241,.20),transparent_36%),linear-gradient(180deg,#050914_0%,#070b16_100%)]" />
        <div className="pointer-events-none absolute left-[-12rem] top-32 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="pointer-events-none absolute right-[-10rem] top-16 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />

        <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-[1.1fr_.9fr] lg:px-10">
          <section>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-bold uppercase tracking-[.2em] text-cyan-200">
              <Sparkles size={14} /> Member DorizzStore
            </div>
            <h1 className="mt-7 max-w-3xl text-4xl font-black leading-tight md:text-6xl">
              Ajak teman, kumpulkan poin, dan <span className="bg-gradient-to-r from-cyan-300 to-indigo-300 bg-clip-text text-transparent">unlock reward</span> yang kamu mau.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
              Satu link referral, progress transparan, reward fleksibel, dan leaderboard bulanan untuk bikin setiap referral terasa lebih rewarding.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <MiniFeature icon={<Zap size={18} />} title="3 poin" text="Customer baru sukses" />
              <MiniFeature icon={<Gift size={18} />} title="Reward fleksibel" text="Digital, fisik, voucher" />
              <MiniFeature icon={<Trophy size={18} />} title="Leaderboard" text="Kompetisi bulanan" />
            </div>
          </section>

          <section className={`${panel} p-6 md:p-8`}>
            <div className="mb-6 flex rounded-2xl border border-white/10 bg-black/20 p-1.5">
              <button onClick={() => { setMode("join"); setError(""); }} className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold transition ${mode === "join" ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"}`}>Gabung Member</button>
              <button onClick={() => { setMode("login"); setError(""); }} className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold transition ${mode === "login" ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"}`}>Masuk</button>
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-black">{mode === "join" ? "Mulai jadi Member" : "Selamat datang kembali"}</h2>
              <p className="mt-1 text-sm text-slate-400">{mode === "join" ? "Daftar sekali, referral link langsung dibuat otomatis." : "Masuk untuk melihat poin, reward, dan referral kamu."}</p>
            </div>

            <form onSubmit={submit} className="space-y-3.5">
              {mode === "join" && <input name="name" required placeholder="Nama lengkap" className={input} />}
              <input name="email" type="email" required placeholder="Email" autoComplete="email" className={input} />
              {mode === "join" && <input name="whatsapp" placeholder="Nomor WhatsApp" autoComplete="tel" className={input} />}
              <input name="password" type="password" required minLength={8} placeholder="Password minimal 8 karakter" autoComplete={mode === "login" ? "current-password" : "new-password"} className={input} />
              {mode === "join" && (
                <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[.025] p-4 text-sm text-slate-300">
                  <input type="checkbox" name="acceptTerms" required className="mt-1 accent-cyan-400" />
                  <span>Saya menyetujui <Link className="font-semibold text-cyan-300 hover:underline" href="/member/terms">Syarat & Ketentuan Member</Link>.</span>
                </label>
              )}
              {error && <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
              <button disabled={loading} className={`${primary} w-full py-3.5`}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : mode === "join" ? <UserPlus size={18} /> : <LogIn size={18} />}
                {loading ? "Memproses..." : mode === "join" ? "Gabung Member" : "Masuk ke Member"}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-slate-500">Tidak perlu login customer yang kamu ajak. Mereka tetap checkout normal seperti biasa.</p>
          </section>
        </div>
      </main>
    );
  }

  const referralUrl = typeof window !== "undefined" ? `${window.location.origin}${data.member.referralUrl}` : data.member.referralUrl;
  const progressPct = data.progress ? Math.min(100, Math.round((data.progress.current / Math.max(1, data.progress.target)) * 100)) : 0;

  async function copyReferral() {
    await navigator.clipboard.writeText(referralUrl);
    setCopyLabel("Tersalin!");
    setTimeout(() => setCopyLabel("Copy link"), 1600);
  }

  return (
    <main className="min-h-screen bg-[#050914] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,.11),transparent_28%),radial-gradient(circle_at_90%_5%,rgba(99,102,241,.14),transparent_30%)]" />
      <div className="relative mx-auto max-w-7xl space-y-7 px-5 py-8 md:px-8 md:py-10">
        <section className={`${panel} overflow-hidden p-6 md:p-8`}>
          <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-bold text-emerald-200">
                <CheckCircle2 size={14} /> Member aktif
              </div>
              <h1 className="mt-4 text-3xl font-black md:text-4xl">Halo, {data.member.name} 👋</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400 md:text-base">Pantau progress referral, kumpulkan poin, dan pilih reward berikutnya dari satu dashboard.</p>
            </div>
            <Link href="/member/leaderboard" className={secondary}><Medal size={18} /> Leaderboard bulanan <ArrowRight size={16} /></Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={<Sparkles size={20} />} label="Poin tersedia" value={data.points.available} accent="cyan" />
          <StatCard icon={<WalletCards size={20} />} label="Poin di-hold" value={data.points.held} accent="indigo" />
          <StatCard icon={<Users size={20} />} label="Referral berhasil" value={data.referrals.total} accent="emerald" />
          <StatCard icon={<Zap size={20} />} label="Referral bulan ini" value={data.monthly.referrals} accent="amber" />
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <div className={`${panel} p-6`}>
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">Referral link</p><h2 className="mt-1 text-xl font-black">Ajak teman dari link kamu</h2></div>
              <Users className="text-cyan-300" />
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input readOnly value={referralUrl} className={`${input} flex-1 font-mono text-xs`} />
              <button onClick={copyReferral} className={primary}><Copy size={17} /> {copyLabel}</button>
              {typeof navigator !== "undefined" && typeof navigator.share === "function" && <button onClick={() => navigator.share({ title: "DorizzStore", url: referralUrl })} className={secondary}><Share2 size={17} /> Share</button>}
            </div>
            <p className="mt-3 text-xs text-slate-500">Referral attribution tersimpan 30 hari dan menggunakan last-click.</p>
          </div>

          <div className={`${panel} p-6`}>
            <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-300">Next reward</p><h2 className="mt-1 text-xl font-black">Progress reward</h2></div><Gift className="text-indigo-300" /></div>
            {data.progress ? <><div className="mt-5 flex items-end justify-between gap-3"><div><p className="text-3xl font-black">{data.progress.current}<span className="text-base text-slate-500"> / {data.progress.target}</span></p><p className="mt-1 text-sm text-slate-400">menuju {data.progress.reward}</p></div><span className="text-sm font-bold text-indigo-300">{progressPct}%</span></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500 transition-all" style={{ width: `${progressPct}%` }} /></div></> : <p className="mt-5 text-sm text-slate-400">Reward aktif belum tersedia.</p>}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">Reward catalog</p><h2 className="text-2xl font-black">Pilih reward berikutnya</h2></div><Gift className="text-cyan-300" /></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.rewards.map((r: any) => {
              const canRedeem = data.points.available >= r.points_required;
              return <div key={r.id} className={`${panel} p-5 transition hover:-translate-y-0.5 hover:border-cyan-300/20`}><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-black">{r.name}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{r.description || "Reward Member DorizzStore"}</p></div><div className="rounded-2xl bg-cyan-300/10 p-3 text-cyan-300"><Gift size={20} /></div></div><div className="mt-5 flex items-center justify-between gap-3"><div><p className="text-xs text-slate-500">Dibutuhkan</p><p className="text-xl font-black">{r.points_required} poin</p></div><button disabled={!canRedeem} onClick={() => redeem(r.id)} className={primary}>{canRedeem ? "Tukar reward" : "Poin belum cukup"}</button></div></div>;
            })}
          </div>
        </section>

        <section className={`${panel} p-6`}>
          <div className="flex items-center gap-3"><div className="rounded-2xl bg-emerald-300/10 p-3 text-emerald-300"><WalletCards size={20} /></div><div><h2 className="text-xl font-black">Cash Withdrawal</h2><p className="text-sm text-slate-400">Minimum {data.minimumWithdrawal} poin. Poin langsung masuk status hold ketika diajukan.</p></div></div>
          <form onSubmit={withdraw} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><input name="points" type="number" min={data.minimumWithdrawal} required placeholder="Jumlah poin" className={input} /><input name="method" required placeholder="Bank / e-wallet" className={input} /><input name="accountNumber" required placeholder="Nomor rekening" className={input} /><input name="accountName" required placeholder="Nama pemilik" className={input} /><button className={`${primary} xl:col-span-4`}>Ajukan withdrawal <ArrowRight size={17} /></button></form>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <HistoryPanel title="Referral terbaru" icon={<Users size={18} />} rows={data.history} render={(x: any) => <><b>{x.customer_name || "Customer"}</b><span>Referral berhasil {x.points_awarded > 0 ? `(+${x.points_awarded} poin)` : "(+0 poin)"}</span></>} />
          <HistoryPanel title="Notifikasi" icon={<Bell size={18} />} rows={data.notifications} render={(x: any) => <><b>{x.title}</b><span>{x.message}</span></>} />
          <HistoryPanel title="Riwayat redemption" icon={<Gift size={18} />} rows={data.redemptions} render={(x: any) => <><b>{x.reward_name}</b><span>{x.points} poin · {x.status}{x.voucher_code ? ` · Voucher ${x.voucher_code}` : ""}{x.rejection_reason ? ` · ${x.rejection_reason}` : ""}</span></>} />
          <HistoryPanel title="Riwayat withdrawal" icon={<WalletCards size={18} />} rows={data.withdrawals} render={(x: any) => <><b>{x.points} poin</b><span>Rp{Number(x.amount_rupiah).toLocaleString("id-ID")} · {x.status}{x.rejection_reason ? ` · ${x.rejection_reason}` : ""}</span></>} />
        </section>

        <HistoryPanel title="Riwayat poin" icon={<Sparkles size={18} />} rows={data.ledger} render={(x: any) => <><b>{x.points > 0 ? "+" : ""}{x.points} poin</b><span>{String(x.source_type).replaceAll("_", " ")} · {x.status}{x.note ? ` · ${x.note}` : ""}</span></>} />
      </div>
    </main>
  );
}

function MiniFeature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><div className="mb-3 inline-flex rounded-xl bg-white/5 p-2 text-cyan-300">{icon}</div><p className="font-black">{title}</p><p className="mt-1 text-xs text-slate-500">{text}</p></div>;
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: any; accent: "cyan" | "indigo" | "emerald" | "amber" }) {
  const tones = { cyan: "bg-cyan-300/10 text-cyan-300", indigo: "bg-indigo-300/10 text-indigo-300", emerald: "bg-emerald-300/10 text-emerald-300", amber: "bg-amber-300/10 text-amber-300" };
  return <div className={`${panel} p-5`}><div className={`mb-4 inline-flex rounded-2xl p-3 ${tones[accent]}`}>{icon}</div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-3xl font-black">{value}</p></div>;
}

function HistoryPanel({ title, icon, rows, render }: { title: string; icon: React.ReactNode; rows: any[]; render: (x: any) => React.ReactNode }) {
  return <section className={`${panel} p-5`}><div className="mb-4 flex items-center gap-2"><span className="text-cyan-300">{icon}</span><h2 className="text-lg font-black">{title}</h2></div>{!rows?.length ? <div className="rounded-2xl border border-dashed border-white/10 bg-white/[.02] px-4 py-8 text-center text-sm text-slate-500">Belum ada data.</div> : <div className="divide-y divide-white/5">{rows.map((x: any, i: number) => <div key={x.id || i} className="flex flex-col gap-1 py-3"><div className="font-semibold">{render(x)}</div></div>)}</div>}</section>;
}
