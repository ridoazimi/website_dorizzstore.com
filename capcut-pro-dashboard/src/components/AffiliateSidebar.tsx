"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAffiliateAuth } from "@/context/AffiliateAuthContext";
import {
  LayoutDashboard,
  Users,
  Coins,
  Wallet,
  LogOut,
  Loader2,
  X,
  ShoppingBag,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/affiliate", label: "Dashboard", icon: LayoutDashboard },
  { href: "/affiliate/referrals", label: "Referral Saya", icon: Users },
  { href: "/affiliate/commissions", label: "Riwayat Poin", icon: Coins },
  { href: "/affiliate/payout", label: "Withdraw Poin", icon: Wallet },
];

export default function AffiliateSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAffiliateAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const close = () => setIsOpen(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
  };

  const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden flex items-center justify-center w-10 h-10 rounded-xl"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)" }}
      >
        <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
          <path d="M1 1H17M1 7H17M1 13H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {/* Overlay (mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={close}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar fixed top-0 left-0 h-screen w-[260px] flex flex-col z-40 transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[rgba(99,102,241,0.15)]">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
            >
              <ShoppingBag size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">Dorizz Store</h1>
              <p className="text-[11px] text-[var(--text-muted)]">Loyalty Member</p>
            </div>
          </div>
          <button
            onClick={close}
            className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Balance Card */}
        {user && (
          <div className="px-4 pt-4">
            <div
              className="p-4 rounded-xl"
              style={{
                background: "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.08))",
                border: "1px solid rgba(16,185,129,0.2)",
              }}
            >
              <p className="text-[11px] text-emerald-400/70 uppercase tracking-wider font-semibold">Poin Tersedia</p>
              <p className="text-xl font-bold text-emerald-400 mt-1">{fmt(Number(user.availablePoints || 0))} poin</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-2">
                Senilai Rp {fmt(Number(user.availableRupiah || 0))}
              </p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] px-4 mb-3">
            Menu
          </p>
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/affiliate" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive ? "active" : ""}`}
                onClick={close}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer - User info + Logout */}
        <div className="px-4 py-4 border-t border-[rgba(99,102,241,0.15)]">
          {user && (
            <div className="px-4 mb-3">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-[11px] text-[var(--text-muted)] truncate">{user.email}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="sidebar-link w-full text-left hover:!text-rose-400 hover:!bg-[rgba(244,63,94,0.08)]"
          >
            {loggingOut ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
            {loggingOut ? "Keluar..." : "Keluar"}
          </button>
        </div>
      </aside>
    </>
  );
}
