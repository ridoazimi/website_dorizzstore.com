"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Coins,
  Copy,
  Gift,
  Link2,
  Loader2,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useAffiliateAuth } from "@/context/AffiliateAuthContext";

interface DashboardData {
  member: {
    name: string;
    inviteToken: string | null;
    availablePoints: number;
    pendingPoints: number;
    totalPointsEarned: number;
    availableRupiah: number;
    _count: { referredUsers: number; withdrawals: number };
  };
  recentRewards: {
    id: string;
    points: number;
    status: string;
    createdAt: string;
    user?: { name: string } | null;
    transaction?: { productName: string | null } | null;
  }[];
  monthlyStats: Record<string, number>;
}

export default function LoyaltyMemberDashboardPage() {
  const { user } = useAffiliateAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/affiliate-portal/dashboard")
      .then(response => response.json())
      .then(payload => setData(payload))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (value: number) => new Intl.NumberFormat("id-ID").format(value);
  const member = data?.member;
  const referralUrl = member?.inviteToken && typeof window !== "undefined"
    ? `${window.location.origin}/r/${member.inviteToken}`
    : "";
  const months = Object.entries(data?.monthlyStats || {}).slice(-6);
  const maxPoints = Math.max(...months.map(([, value]) => value), 1);

  const copyReferral = async () => {
    if (!referralUrl) return;
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 size={32} className="animate-spin text-emerald-400" /></div>;
  }

  return (
    <div>
      <div className="px-4 pb-2 pt-6 sm:px-8 sm:pt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400">Dorizz Loyalty Member</p>
        <h1 className="mt-2 text-xl font-bold text-[var(--text-primary)] sm:text-2xl">Selamat datang, {(member?.name || user?.name || "Member").split(" ")[0]}</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)] sm:text-sm">Bagikan link referral dan kumpulkan reward untuk customer baru.</p>
      </div>

      <div className="space-y-5 px-4 pb-8 sm:space-y-6 sm:px-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-4">
          <div className="glass-card stat-card emerald !p-4 sm:!p-6">
            <Coins className="mb-3 text-emerald-400" size={21} />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Poin Available</p>
            <p className="mt-1 text-lg font-bold text-emerald-400 sm:text-2xl">{fmt(member?.availablePoints || 0)}</p>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">Rp {fmt(member?.availableRupiah || 0)}</p>
          </div>
          <div className="glass-card stat-card amber !p-4 sm:!p-6">
            <Wallet className="mb-3 text-amber-400" size={21} />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Poin Pending</p>
            <p className="mt-1 text-lg font-bold text-amber-400 sm:text-2xl">{fmt(member?.pendingPoints || 0)}</p>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">Sedang diproses withdraw</p>
          </div>
          <div className="glass-card stat-card cyan !p-4 sm:!p-6">
            <Users className="mb-3 text-cyan-400" size={21} />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Customer Referral</p>
            <p className="mt-1 text-lg font-bold text-cyan-400 sm:text-2xl">{member?._count?.referredUsers || 0}</p>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">Customer yang terhubung</p>
          </div>
          <div className="glass-card stat-card indigo !p-4 sm:!p-6">
            <Gift className="mb-3 text-[#818cf8]" size={21} />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Total Reward</p>
            <p className="mt-1 text-lg font-bold text-[#818cf8] sm:text-2xl">{fmt(member?.totalPointsEarned || 0)}</p>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">3 poin / customer baru</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 sm:gap-6">
          <div className="glass-card p-5 sm:p-6 lg:col-span-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Referral link saya</p>
                <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">Undang customer baru</h2>
                <p className="mt-1 max-w-lg text-xs leading-relaxed text-[var(--text-muted)]">Link ini hanya memberikan reward jika dipakai customer yang belum terdaftar di database Dorizz dan transaksi pembayarannya berhasil.</p>
              </div>
              <Link2 className="shrink-0 text-emerald-400" size={22} />
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <input readOnly value={referralUrl || "Link referral belum tersedia"} className="form-input min-w-0 flex-1 text-xs" />
              <button onClick={copyReferral} disabled={!referralUrl} className="btn-primary shrink-0 justify-center gap-2 disabled:opacity-50">
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? "Tersalin" : "Salin Link"}
              </button>
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-400/15 bg-emerald-500/5 p-3 text-xs text-emerald-300">
              <ShieldCheck className="mt-0.5 shrink-0" size={15} />
              <span>Customer lama akan diarahkan ke link general Dorizz dan tidak menghasilkan poin referral.</span>
            </div>
          </div>

          <div className="glass-card p-5 sm:p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Reward bulanan</h3>
              <TrendingUp size={17} className="text-emerald-400" />
            </div>
            {months.length > 0 ? (
              <div className="mt-5 flex h-32 items-end gap-2 sm:h-36">
                {months.map(([month, points]) => (
                  <div key={month} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-[9px] font-semibold text-emerald-400">{points}p</span>
                    <div className="w-full rounded-t-lg bg-gradient-to-t from-emerald-600 to-emerald-300" style={{ height: `${Math.max(5, (points / maxPoints) * 100)}%` }} />
                    <span className="text-[9px] text-[var(--text-muted)]">{new Date(`${month}-01`).toLocaleDateString("id-ID", { month: "short" })}</span>
                  </div>
                ))}
              </div>
            ) : <div className="flex h-32 items-center justify-center text-sm text-[var(--text-muted)]">Belum ada reward</div>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <Link href="/affiliate/referrals" className="glass-card group p-4 transition hover:border-cyan-500/30"><div className="flex items-center gap-3"><Users size={18} className="text-cyan-400" /><div className="flex-1"><p className="text-sm font-semibold text-[var(--text-primary)]">Referral Saya</p><p className="text-[10px] text-[var(--text-muted)]">Lihat status customer baru</p></div><ArrowRight size={16} className="text-[var(--text-muted)]" /></div></Link>
          <Link href="/affiliate/commissions" className="glass-card group p-4 transition hover:border-amber-500/30"><div className="flex items-center gap-3"><Coins size={18} className="text-amber-400" /><div className="flex-1"><p className="text-sm font-semibold text-[var(--text-primary)]">Riwayat Poin</p><p className="text-[10px] text-[var(--text-muted)]">Reward dan perubahan saldo</p></div><ArrowRight size={16} className="text-[var(--text-muted)]" /></div></Link>
          <Link href="/affiliate/payout" className="glass-card group p-4 transition hover:border-emerald-500/30"><div className="flex items-center gap-3"><Wallet size={18} className="text-emerald-400" /><div className="flex-1"><p className="text-sm font-semibold text-[var(--text-primary)]">Withdraw Poin</p><p className="text-[10px] text-[var(--text-muted)]">Minimal 30 poin / Rp30.000</p></div><ArrowRight size={16} className="text-[var(--text-muted)]" /></div></Link>
        </div>

        <div className="text-center text-[11px] text-[var(--text-muted)]">1 customer baru yang transaksi sukses = 3 poin = Rp3.000.</div>
      </div>
    </div>
  );
}
