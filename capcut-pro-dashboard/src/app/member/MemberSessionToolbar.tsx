"use client";

import { useEffect, useState } from "react";
import { Bell, LogOut } from "lucide-react";

export default function MemberSessionToolbar() {
  const [authenticated, setAuthenticated] = useState(false);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);

  async function refreshNotifications() {
    try {
      const res = await fetch("/api/member/notifications", { cache: "no-store" });
      if (!res.ok) {
        setAuthenticated(false);
        setUnread(0);
        return;
      }
      const rows = await res.json();
      setAuthenticated(true);
      setUnread(Array.isArray(rows) ? rows.filter((item: any) => !item.is_read).length : 0);
    } catch {
      setAuthenticated(false);
    }
  }

  useEffect(() => { void refreshNotifications(); }, []);

  async function markAllRead() {
    setBusy(true);
    try {
      const res = await fetch("/api/member/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) setUnread(0);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/member/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/member";
    }
  }

  if (!authenticated) return null;

  return (
    <div className="fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-2xl border border-white/10 bg-[#0b1020]/90 p-2 shadow-2xl backdrop-blur-xl md:right-6 md:top-6">
      <button
        type="button"
        onClick={markAllRead}
        disabled={busy || unread === 0}
        className="relative inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
        title={unread ? "Tandai semua notifikasi sudah dibaca" : "Tidak ada notifikasi baru"}
      >
        <Bell size={16} />
        <span className="hidden sm:inline">Notifikasi</span>
        {unread > 0 && <span className="min-w-5 rounded-full bg-cyan-400 px-1.5 py-0.5 text-center text-[10px] font-black text-slate-950">{unread}</span>}
      </button>
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-slate-300 transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-200 disabled:opacity-50"
      >
        <LogOut size={16} />
        <span className="hidden sm:inline">Keluar</span>
      </button>
    </div>
  );
}
