"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Coins, Loader2 } from "lucide-react";

interface PointEntry {
  id: string;
  points: number;
  type: string;
  status: string;
  note: string | null;
  createdAt: string;
  user?: { name: string } | null;
  transaction?: { productName: string | null } | null;
  withdrawal?: { id: string; status: string } | null;
}

export default function PointHistoryPage() {
  const [entries, setEntries] = useState<PointEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/affiliate-portal/points?page=${page}`);
      const data = await response.json();
      setEntries(data.entries || []);
      setTotalPages(data.totalPages || 1);
    } finally {
      setLoading(false);
    }
  }, [page]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchEntries(); }, [fetchEntries]);
  const fmt = (value: number) => new Intl.NumberFormat("id-ID").format(value);

  return (
    <div>
      <div className="px-4 pb-2 pt-6 sm:px-8 sm:pt-8"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-400">Loyalty Ledger</p><h1 className="mt-2 text-xl font-bold text-[var(--text-primary)] sm:text-2xl">Riwayat Poin</h1><p className="mt-1 text-xs text-[var(--text-muted)] sm:text-sm">Semua reward, withdraw, dan koreksi saldo tercatat di sini.</p></div>
      <div className="px-4 pb-8 sm:px-8"><div className="glass-card overflow-hidden"><div className="flex items-center gap-2 border-b border-[var(--border-color)] px-5 py-4"><Coins size={17} className="text-amber-400" /><h2 className="text-sm font-semibold text-[var(--text-primary)]">Aktivitas Poin</h2></div>{loading ? <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-amber-400" /></div> : entries.length === 0 ? <div className="py-20 text-center text-sm text-[var(--text-muted)]">Belum ada aktivitas poin.</div> : <div className="divide-y divide-[rgba(99,102,241,0.06)]">{entries.map(entry => { const positive = entry.points > 0; const label = entry.type === "referral_reward" ? `Reward customer baru${entry.user?.name ? ` · ${entry.user.name}` : ""}` : entry.type === "manual_adjustment" ? "Koreksi admin" : "Aktivitas poin"; return <div key={entry.id} className="flex items-center justify-between gap-4 px-5 py-4"><div className="flex min-w-0 items-center gap-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${positive ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>{positive ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--text-primary)]">{label}</p><p className="mt-1 truncate text-xs text-[var(--text-muted)]">{entry.note || entry.transaction?.productName || "-"} · {new Date(entry.createdAt).toLocaleString("id-ID")}</p></div></div><div className="shrink-0 text-right"><p className={`text-sm font-bold ${positive ? "text-emerald-400" : "text-rose-400"}`}>{positive ? "+" : ""}{fmt(entry.points)} poin</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{entry.status}</p></div></div>; })}</div>}{totalPages > 1 && <div className="flex items-center justify-center gap-2 border-t border-[var(--border-color)] p-4"><button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1} className="btn-icon"><ChevronLeft size={16} /></button><span className="text-xs text-[var(--text-secondary)]">{page} / {totalPages}</span><button onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={page >= totalPages} className="btn-icon"><ChevronRight size={16} /></button></div>}</div></div>
    </div>
  );
}
