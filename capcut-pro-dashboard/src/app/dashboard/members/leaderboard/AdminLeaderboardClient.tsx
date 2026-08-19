"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Crown, Loader2, Medal, Plus, Sparkles, Trophy, Users } from "lucide-react";

const card = "rounded-2xl border border-white/8 bg-white/[.025]";
const input = "w-full rounded-xl border border-white/10 bg-white/[.035] px-3.5 py-3 text-sm text-white outline-none transition focus:border-[var(--accent-primary)] focus:bg-white/[.05]";
const primary = "inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-primary)] px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40";

function formatDate(v: any) {
  if (!v) return "-";
  return new Date(v).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function campaignState(c: any) {
  const now = new Date();
  const start = new Date(`${String(c.month_start).slice(0, 10)}T00:00:00`);
  const end = new Date(`${String(c.month_end).slice(0, 10)}T23:59:59`);
  if (c.status !== "active") return { label: "Selesai", cls: "border-white/10 bg-white/5 text-slate-300" };
  if (now < start) return { label: "Akan datang", cls: "border-sky-400/20 bg-sky-400/10 text-sky-300" };
  if (now > end) return { label: "Berakhir", cls: "border-white/10 bg-white/5 text-slate-300" };
  return { label: "Aktif", cls: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" };
}

export default function AdminLeaderboardClient() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const ranks = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 1), []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/admin/members/leaderboard", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal memuat leaderboard");
      setData(j);
    } catch (e: any) {
      setError(e.message || "Gagal memuat leaderboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const campaigns = data?.campaigns || [];
  const prizes = data?.prizes || [];
  const ranking = data?.ranking || [];
  const activeCampaign = campaigns.find((c: any) => campaignState(c).label === "Aktif") || null;

  async function createCampaign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setNotice("");
    const form = e.currentTarget;
    const f = new FormData(form);
    const campaignPrizes = ranks.map(rank => ({ rank, prizeName: String(f.get(`p${rank}`) || "").trim() })).filter(x => x.prizeName);
    try {
      const r = await fetch("/api/admin/members/leaderboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: f.get("name"), monthStart: f.get("monthStart"), monthEnd: f.get("monthEnd"), prizes: campaignPrizes }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal membuat campaign");
      form.reset();
      setShowForm(false);
      setNotice("Campaign leaderboard berhasil dibuat.");
      await load();
    } catch (e: any) {
      setNotice(e.message || "Gagal membuat campaign");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className={`${card} grid min-h-64 place-items-center`}><Loader2 className="animate-spin" /></div>;
  if (error) return <div className={`${card} p-5 text-rose-300`}>{error}</div>;

  return (
    <div className="space-y-5">
      {notice && <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/10 px-3 py-1 text-xs font-bold text-[var(--accent-primary)]">
            <Sparkles size={13} /> Leaderboard Control Center
          </div>
          <h2 className="text-2xl font-black sm:text-3xl">Leaderboard Member</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">Pantau posisi Member bulan ini, lihat campaign aktif, dan atur hadiah Top 1–10 dari satu halaman.</p>
        </div>
        <button className={primary} onClick={() => setShowForm(v => !v)}><Plus size={16} /> {showForm ? "Tutup Form" : "Buat Campaign Baru"}</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<Users size={18} />} label="Member Aktif" value={data?.memberStats?.active_members || 0} hint={`${data?.memberStats?.total_members || 0} total member`} />
        <Stat icon={<Trophy size={18} />} label="Campaign Aktif" value={activeCampaign ? 1 : 0} hint={activeCampaign?.name || "Belum ada campaign aktif"} />
        <Stat icon={<Medal size={18} />} label="Hadiah Aktif" value={activeCampaign ? prizes.filter((x: any) => x.campaign_id === activeCampaign.id).length : 0} hint="Slot hadiah Top 1–10" />
        <Stat icon={<Crown size={18} />} label="Poin Tertinggi" value={ranking[0]?.points || 0} hint={ranking[0]?.name || "Belum ada poin bulan ini"} />
      </div>

      {showForm && (
        <form onSubmit={createCampaign} className={`${card} overflow-hidden`}>
          <div className="border-b border-white/8 px-5 py-4">
            <h3 className="font-black">Buat Campaign Baru</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Isi periode campaign dan hadiah. Hadiah yang dikosongkan tidak akan dibuat.</p>
          </div>
          <div className="space-y-5 p-5">
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
              <label className="space-y-2"><span className="text-xs font-bold text-slate-300">Nama campaign</span><input name="name" required className={input} placeholder="Contoh: Member Champion Agustus" /></label>
              <label className="space-y-2"><span className="text-xs font-bold text-slate-300">Tanggal mulai</span><input name="monthStart" type="date" required className={input} /></label>
              <label className="space-y-2"><span className="text-xs font-bold text-slate-300">Tanggal selesai</span><input name="monthEnd" type="date" required className={input} /></label>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3"><div><p className="font-bold">Hadiah Ranking</p><p className="text-xs text-[var(--text-muted)]">Top 1–3 dibuat lebih menonjol agar mudah dicek.</p></div><span className="text-xs text-[var(--text-muted)]">Opsional</span></div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {ranks.map(rank => <PrizeInput key={rank} rank={rank} />)}
              </div>
            </div>

            <div className="flex justify-end border-t border-white/8 pt-4"><button disabled={saving} className={`${primary} min-w-48`}>{saving ? <><Loader2 size={16} className="animate-spin" /> Menyimpan...</> : <><Trophy size={16} /> Buat Campaign</>}</button></div>
          </div>
        </form>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <section className={`${card} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <div><h3 className="font-black">Ranking Bulan Ini</h3><p className="mt-1 text-xs text-[var(--text-muted)]">Berdasarkan poin referral Member bulan berjalan.</p></div>
            <span className="rounded-lg bg-white/5 px-2.5 py-1 text-xs text-[var(--text-muted)]">Top 10</span>
          </div>
          {!ranking.length ? <div className="p-8 text-center text-sm text-[var(--text-muted)]">Belum ada data ranking bulan ini.</div> : <div className="divide-y divide-white/6">{ranking.map((m: any, index: number) => <RankRow key={m.id} member={m} index={index} />)}</div>}
        </section>

        <section className={`${card} overflow-hidden`}>
          <div className="border-b border-white/8 px-5 py-4"><h3 className="font-black">Campaign Aktif</h3><p className="mt-1 text-xs text-[var(--text-muted)]">Ringkasan campaign yang sedang berjalan.</p></div>
          {activeCampaign ? <ActiveCampaign campaign={activeCampaign} prizes={prizes.filter((x: any) => x.campaign_id === activeCampaign.id)} /> : <div className="p-8 text-center"><Trophy className="mx-auto mb-3 opacity-30" /><p className="font-bold">Belum ada campaign aktif</p><p className="mt-1 text-xs text-[var(--text-muted)]">Buat campaign untuk mulai menampilkan hadiah leaderboard.</p></div>}
        </section>
      </div>

      <section className={`${card} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4"><div><h3 className="font-black">Riwayat Campaign</h3><p className="mt-1 text-xs text-[var(--text-muted)]">Semua campaign yang pernah dibuat.</p></div><span className="text-xs text-[var(--text-muted)]">{campaigns.length} campaign</span></div>
        {!campaigns.length ? <div className="p-8 text-center text-sm text-[var(--text-muted)]">Belum ada campaign.</div> : <div className="grid gap-3 p-4 lg:grid-cols-2">{campaigns.map((c: any) => <CampaignCard key={c.id} campaign={c} prizes={prizes.filter((x: any) => x.campaign_id === c.id)} />)}</div>}
      </section>
    </div>
  );
}

function Stat({ icon, label, value, hint }: any) {
  return <div className={`${card} p-4`}><div className="flex items-center justify-between"><div className="grid h-9 w-9 place-items-center rounded-xl bg-white/[.05] text-[var(--accent-primary)]">{icon}</div><span className="text-2xl font-black">{value}</span></div><p className="mt-3 text-sm font-bold">{label}</p><p className="mt-1 truncate text-xs text-[var(--text-muted)]">{hint}</p></div>;
}

function PrizeInput({ rank }: { rank: number }) {
  const top = rank <= 3;
  return <label className={`rounded-xl border p-3 ${top ? "border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/[.05]" : "border-white/8 bg-white/[.02]"}`}><div className="mb-2 flex items-center gap-2"><span className={`grid h-6 w-6 place-items-center rounded-md text-xs font-black ${top ? "bg-[var(--accent-primary)] text-white" : "bg-white/8 text-slate-300"}`}>{rank}</span><span className="text-xs font-bold">Top {rank}</span></div><input name={`p${rank}`} className={`${input} !py-2.5`} placeholder={`Hadiah Top ${rank}`} /></label>;
}

function RankRow({ member, index }: any) {
  const top = index < 3;
  return <div className={`flex items-center gap-3 px-5 py-3.5 ${top ? "bg-white/[.015]" : ""}`}><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black ${index === 0 ? "bg-amber-400/15 text-amber-300" : index === 1 ? "bg-slate-300/10 text-slate-200" : index === 2 ? "bg-orange-400/10 text-orange-300" : "bg-white/5 text-slate-400"}`}>{index + 1}</div><div className="min-w-0 flex-1"><p className="truncate font-bold">{member.name}</p><p className="truncate text-xs text-[var(--text-muted)]">{member.email}</p></div><div className="text-right"><p className="font-black">{member.points} poin</p><p className="text-[11px] text-[var(--text-muted)]">bulan ini</p></div></div>;
}

function ActiveCampaign({ campaign, prizes }: any) {
  const state = campaignState(campaign);
  return <div className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-black">{campaign.name}</p><div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-muted)]"><CalendarDays size={13} /> {formatDate(campaign.month_start)} — {formatDate(campaign.month_end)}</div></div><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${state.cls}`}>{state.label}</span></div><div className="mt-5 space-y-2">{prizes.length ? prizes.map((x: any) => <div key={x.id} className="flex items-center justify-between rounded-xl border border-white/7 bg-white/[.02] px-3 py-2.5"><span className="text-sm font-bold">Top {x.rank}</span><span className="max-w-[65%] truncate text-sm text-slate-300">{x.prize_name}</span></div>) : <p className="text-sm text-[var(--text-muted)]">Campaign ini belum memiliki hadiah.</p>}</div></div>;
}

function CampaignCard({ campaign, prizes }: any) {
  const state = campaignState(campaign);
  return <div className="rounded-xl border border-white/8 bg-white/[.02] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-black">{campaign.name}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{formatDate(campaign.month_start)} — {formatDate(campaign.month_end)}</p></div><span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${state.cls}`}>{state.label}</span></div><div className="mt-3 flex flex-wrap gap-1.5">{prizes.slice(0, 5).map((x: any) => <span key={x.id} className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-slate-300">#{x.rank} {x.prize_name}</span>)}{prizes.length > 5 && <span className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-slate-400">+{prizes.length - 5} lainnya</span>}{!prizes.length && <span className="text-xs text-[var(--text-muted)]">Tanpa hadiah</span>}</div></div>;
}
