"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle, ChevronLeft, ChevronRight, Clock, Loader2, Send, Wallet, XCircle } from "lucide-react";
import { useAffiliateAuth } from "@/context/AffiliateAuthContext";

interface Withdrawal {
  id: string;
  points: number | null;
  amount: number;
  method: string | null;
  accountNumber: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  processedAt: string | null;
}

const MIN_POINTS = 30;
const MAX_POINTS = 1000;
const QUICK_POINTS = [30, 60, 90, 150, 300];
const METHODS = [
  { value: "dana", label: "DANA" },
  { value: "gopay", label: "GoPay" },
  { value: "ovo", label: "OVO" },
  { value: "shopeepay", label: "ShopeePay" },
  { value: "bank_transfer", label: "Transfer Bank" },
];

export default function LoyaltyPayoutPage() {
  const { user, refetch } = useAffiliateAuth();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [points, setPoints] = useState("");
  const [method, setMethod] = useState("dana");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fmt = (value: number) => new Intl.NumberFormat("id-ID").format(value);
  const rupiah = (value: number) => `Rp ${fmt(value * 1000)}`;

  const fetchWithdrawals = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/affiliate-portal/payout?page=${page}`);
      const data = await response.json();
      setWithdrawals(data.withdrawals || []);
      setTotalPages(data.totalPages || 1);
    } finally {
      setLoading(false);
    }
  }, [page]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchWithdrawals(); }, [fetchWithdrawals]);

  const handleWithdraw = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    const value = Number(points);
    if (!Number.isInteger(value) || value < MIN_POINTS || value > MAX_POINTS || value % 3 !== 0) {
      setError(`Withdraw harus ${MIN_POINTS}–${MAX_POINTS} poin dan kelipatan 3.`);
      return;
    }
    if (value > Number(user?.availablePoints || 0)) {
      setError("Saldo poin available tidak mencukupi.");
      return;
    }
    if (!accountNumber.trim()) {
      setError("Nomor rekening atau e-wallet wajib diisi.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/affiliate-portal/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: value, method, accountNumber, accountName }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Gagal membuat pengajuan withdraw.");
        return;
      }
      setSuccess(data.message || "Pengajuan withdraw berhasil dibuat.");
      setPoints("");
      setAccountNumber("");
      setAccountName("");
      refetch();
      fetchWithdrawals();
    } catch {
      setError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  const hasPending = withdrawals.some(item => ["pending", "processing", "approved"].includes(item.status));
  const availablePoints = Number(user?.availablePoints || 0);

  const statusIcon = (status: string) => {
    if (status === "paid") return <CheckCircle size={14} className="text-emerald-400" />;
    if (["pending", "processing", "approved"].includes(status)) return <Clock size={14} className="animate-pulse text-amber-400" />;
    if (status === "rejected") return <XCircle size={14} className="text-rose-400" />;
    return <Clock size={14} className="text-[var(--text-muted)]" />;
  };

  const statusLabel: Record<string, string> = { pending: "Menunggu", processing: "Diproses", approved: "Disetujui", paid: "Dibayar", rejected: "Ditolak" };
  const statusClass: Record<string, string> = { pending: "badge-warning", processing: "badge-warning", approved: "badge-info", paid: "badge-success", rejected: "badge-danger" };

  return (
    <div>
      <div className="px-4 pb-2 pt-6 sm:px-8 sm:pt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400">Loyalty Member</p>
        <h1 className="mt-2 text-xl font-bold text-[var(--text-primary)] sm:text-2xl">Withdraw Poin</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)] sm:text-sm">Ajukan pencairan sendiri. Pembayaran tetap diverifikasi dan diproses oleh admin.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 px-4 pb-8 lg:grid-cols-5 sm:px-8 sm:gap-6">
        <div className="lg:col-span-2">
          <div className="glass-card space-y-5 p-5 sm:p-6">
            <div className="rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/15 to-emerald-900/10 p-5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Poin Available</p>
              <p className="mt-1 text-3xl font-bold text-emerald-400">{fmt(availablePoints)} poin</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Senilai {rupiah(availablePoints)}</p>
              <p className="mt-3 text-[10px] text-[var(--text-muted)]">Minimum {MIN_POINTS} poin · Maksimum {MAX_POINTS} poin</p>
            </div>

            {hasPending && <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-300"><AlertTriangle size={15} className="mt-0.5 shrink-0" />Selesaikan pengajuan sebelumnya sebelum membuat pengajuan baru.</div>}

            <form onSubmit={handleWithdraw} className="space-y-4">
              <div>
                <label className="form-label">Jumlah poin</label>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {QUICK_POINTS.map(value => <button key={value} type="button" disabled={value > availablePoints || hasPending} onClick={() => setPoints(String(value))} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-30 ${Number(points) === value ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300" : "border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"}`}>{value}p</button>)}
                </div>
                <input type="number" min={MIN_POINTS} max={Math.min(MAX_POINTS, availablePoints)} step={3} value={points} onChange={event => setPoints(event.target.value)} className="form-input" placeholder="Contoh: 30" disabled={hasPending} />
                {Number(points) > 0 && <p className="mt-1 text-xs text-emerald-400">Nilai withdraw: {rupiah(Number(points))}</p>}
              </div>

              <div>
                <label className="form-label">Metode pembayaran</label>
                <select value={method} onChange={event => setMethod(event.target.value)} className="form-input" disabled={hasPending}>{METHODS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
              </div>

              <div><label className="form-label">Nomor rekening / e-wallet</label><input value={accountNumber} onChange={event => setAccountNumber(event.target.value)} className="form-input" placeholder="Masukkan nomor tujuan" disabled={hasPending} /></div>
              <div><label className="form-label">Nama pemilik</label><input value={accountName} onChange={event => setAccountName(event.target.value)} className="form-input" placeholder="Nama sesuai tujuan pembayaran" disabled={hasPending} /></div>

              {error && <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div>}
              {success && <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{success}</div>}

              <button type="submit" disabled={submitting || hasPending || availablePoints < MIN_POINTS} className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                {submitting ? "Mengajukan..." : "Ajukan Withdraw"}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="glass-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-[var(--border-color)] px-5 py-4"><Banknote size={17} className="text-emerald-400" /><h2 className="text-sm font-semibold text-[var(--text-primary)]">Riwayat Withdraw</h2></div>
            {loading ? <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-emerald-400" /></div> : withdrawals.length === 0 ? <div className="py-16 text-center"><Wallet size={36} className="mx-auto mb-3 text-[var(--text-muted)]" /><p className="text-sm text-[var(--text-muted)]">Belum ada pengajuan withdraw.</p></div> : <div className="divide-y divide-[rgba(99,102,241,0.06)]">{withdrawals.map(item => <div key={item.id} className="flex items-start justify-between gap-3 px-5 py-4"><div className="flex min-w-0 items-start gap-3"><div className="mt-0.5 shrink-0">{statusIcon(item.status)}</div><div className="min-w-0"><p className="text-sm font-semibold text-[var(--text-primary)]">{fmt(Number(item.points || 0))} poin · Rp {fmt(Number(item.amount || 0))}</p><p className="mt-1 truncate text-xs text-[var(--text-muted)]">{item.method || "-"} · {item.accountNumber || "-"}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{new Date(item.createdAt).toLocaleString("id-ID")}</p>{item.notes && <p className="mt-1 text-xs text-[var(--text-muted)]">{item.notes}</p>}</div></div><span className={`badge shrink-0 text-[10px] ${statusClass[item.status] || "badge-neutral"}`}>{statusLabel[item.status] || item.status}</span></div>)}</div>}
            {totalPages > 1 && <div className="flex items-center justify-center gap-2 border-t border-[var(--border-color)] p-4"><button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1} className="btn-icon"><ChevronLeft size={16} /></button><span className="text-xs text-[var(--text-secondary)]">{page} / {totalPages}</span><button onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={page >= totalPages} className="btn-icon"><ChevronRight size={16} /></button></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
