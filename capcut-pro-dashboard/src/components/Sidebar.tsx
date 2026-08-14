"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useMobileNav } from "@/context/MobileNavContext";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  Package,
  ShieldCheck,
  MessageSquare,
  Settings,
  Scissors,
  CalendarClock,
  UserPlus,
  RefreshCw,
  X,
  Lock,
  ClipboardList,
  ShoppingBag,
  Star,
  Bot,
  Send,
  Loader2,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import type { PermissionKey } from "@/lib/auth-shared";

type AIMessage = {
  role: "user" | "assistant";
  content: string;
};

type JsonRecord = Record<string, unknown>;

const navItems: { href: string; label: string; icon: React.ElementType; permission?: PermissionKey }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transaksi", icon: ArrowLeftRight, permission: "page_transactions" },
  { href: "/users", label: "Pelanggan", icon: Users, permission: "page_customers" },
  { href: "/stock", label: "Stok Akun", icon: Package, permission: "page_stock" },
  { href: "/dashboard/products", label: "Produk Marketplace", icon: ShoppingBag, permission: "page_marketplace" },
  { href: "/dashboard/warranty", label: "Klaim Garansi", icon: ShieldCheck, permission: "page_stock" },
  { href: "/messages", label: "Riwayat Pesan", icon: MessageSquare, permission: "page_messages" },
];

const marketingItems: { href: string; label: string; icon: React.ElementType; permission?: PermissionKey }[] = [
  { href: "/dashboard/vouchers", label: "Voucher", icon: Scissors, permission: "page_vouchers" },
  { href: "/dashboard/testimoni", label: "Kelola Testimoni", icon: Star, permission: "page_testimonials" },
  { href: "/followup", label: "Follow-Up", icon: CalendarClock, permission: "page_followup" },
  { href: "/affiliates", label: "Affiliate", icon: UserPlus, permission: "page_affiliates" },
  { href: "/sales", label: "Tim Sales", icon: Users, permission: "page_sales" },
  { href: "/retention", label: "Analisis Retensi", icon: RefreshCw, permission: "page_retention" },
  { href: "/absensi", label: "Absensi & Tugas", icon: ClipboardList, permission: "page_absensi" },
];

const aiQuickQuestions = [
  "Berapa transaksi dan omzet hari ini? Bandingkan dengan kemarin.",
  "Berapa lead baru hari ini dan bagaimana trennya?",
  "Bagaimana kondisi stok sekarang? Perlu restok apa?",
  "Analisis 30 hari terakhir dan beri 3 keputusan terpenting.",
];

async function readJsonResponse(res: Response): Promise<JsonRecord> {
  const raw = await res.text();
  if (!raw.trim()) {
    throw new Error(`Server Dorizz AI tidak mengembalikan data (HTTP ${res.status}).`);
  }

  try {
    return JSON.parse(raw) as JsonRecord;
  } catch {
    console.error("Dorizz AI returned non-JSON response", {
      status: res.status,
      contentType: res.headers.get("content-type"),
      preview: raw.slice(0, 200),
    });
    throw new Error(
      res.ok
        ? "Respons Dorizz AI tidak valid. Silakan refresh halaman lalu coba lagi."
        : `Server Dorizz AI sedang bermasalah (HTTP ${res.status}). Silakan coba lagi.`,
    );
  }
}

export default function Sidebar() {
  const pathname = usePathname();
  const { isOpen, close } = useMobileNav();
  const { hasPermission, isDeveloper } = useAuth();
  const [pendingClaimsCount, setPendingClaimsCount] = useState(0);
  const [showAI, setShowAI] = useState(false);
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/stats");
        const data = await readJsonResponse(res);
        const count = data.pendingWarrantyClaims;
        if (typeof count === "number") setPendingClaimsCount(count);
      } catch (err) {
        console.error("Failed to fetch pending claims count:", err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLinkClick = () => close();
  const canUseAI = isDeveloper || hasPermission("page_ai");

  async function sendAI(question?: string) {
    const text = (question ?? aiInput).trim();
    if (!text || aiLoading) return;

    const nextMessages: AIMessage[] = [...aiMessages, { role: "user", content: text }];
    setAiMessages(nextMessages);
    setAiInput("");
    setAiError("");
    setAiLoading(true);

    try {
      const res = await fetch("/api/stats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data = await readJsonResponse(res);
      const errorMessage = typeof data.error === "string" ? data.error : "AI gagal merespons";
      if (!res.ok) throw new Error(errorMessage);

      const answer = typeof data.answer === "string" ? data.answer.trim() : "";
      if (!answer) throw new Error("Dorizz AI tidak mengembalikan jawaban.");

      setAiMessages((current) => [...current, { role: "assistant", content: answer }]);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Terjadi kesalahan saat menghubungi Dorizz AI");
    } finally {
      setAiLoading(false);
    }
  }

  function renderNavItem(item: typeof navItems[0]) {
    const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
    const allowed = !item.permission || hasPermission(item.permission);

    if (!allowed) {
      return (
        <div key={item.href} className="sidebar-link opacity-30 cursor-not-allowed" title="Akses tidak diizinkan">
          <item.icon size={18} />
          {item.label}
          <Lock size={11} className="ml-auto flex-shrink-0" />
        </div>
      );
    }

    return (
      <Link key={item.href} href={item.href} className={`sidebar-link ${isActive ? "active" : ""}`} onClick={handleLinkClick}>
        <item.icon size={18} />
        <span className="flex-1">{item.label}</span>
        {item.label === "Klaim Garansi" && pendingClaimsCount > 0 && (
          <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] flex items-center justify-center animate-pulse">
            {pendingClaimsCount}
          </span>
        )}
      </Link>
    );
  }

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden" onClick={close} aria-hidden="true" />}

      <aside
        className={`sidebar fixed top-0 left-0 h-screen w-[260px] flex flex-col z-40 transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[rgba(99,102,241,0.15)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--gradient-primary)" }}>
              <ShoppingBag size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Dorizz Store</h1>
              <p className="text-[11px] text-[var(--text-muted)]">Management Dashboard</p>
            </div>
          </div>
          <button onClick={close} className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] px-4 mb-3">Menu Utama</p>
          {navItems.map(renderNavItem)}

          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] px-4 mb-3 mt-6">Marketing</p>
          {marketingItems.map(renderNavItem)}
        </nav>

        <div className="px-4 pt-3 border-t border-[rgba(99,102,241,0.15)]">
          {canUseAI ? (
            <button
              onClick={() => {
                setShowAI(true);
                close();
              }}
              className="sidebar-link w-full text-left"
              style={{ background: "linear-gradient(135deg, rgba(99,102,241,.12), rgba(124,58,237,.08))" }}
            >
              <Bot size={18} className="text-[#818cf8]" />
              <span className="flex-1">Dorizz AI</span>
              <Sparkles size={13} className="text-[#818cf8]" />
            </button>
          ) : (
            <div className="sidebar-link opacity-30 cursor-not-allowed" title="Akses AI tidak diizinkan">
              <Bot size={18} />
              Dorizz AI
              <Lock size={11} className="ml-auto" />
            </div>
          )}
        </div>

        <div className="px-4 py-4">
          {isDeveloper || hasPermission("page_settings") ? (
            <Link href="/settings" className={`sidebar-link ${pathname === "/settings" ? "active" : ""}`} onClick={handleLinkClick}>
              <Settings size={18} />
              Pengaturan
            </Link>
          ) : (
            <div className="sidebar-link opacity-30 cursor-not-allowed" title="Akses tidak diizinkan">
              <Settings size={18} />
              Pengaturan
              <Lock size={11} className="ml-auto flex-shrink-0" />
            </div>
          )}
        </div>
      </aside>

      {showAI && canUseAI && (
        <>
          <button className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" onClick={() => setShowAI(false)} aria-label="Tutup Dorizz AI" />
          <section
            className="fixed z-[60] inset-3 sm:inset-auto sm:right-5 sm:bottom-5 sm:w-[430px] sm:h-[650px] rounded-2xl overflow-hidden flex flex-col"
            style={{ background: "rgba(12,14,27,.98)", border: "1px solid rgba(129,140,248,.25)", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}
          >
            <div className="px-4 py-3.5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,.07)" }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(129,140,248,.15)" }}>
                  <Bot size={18} className="text-[#818cf8]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Dorizz AI</p>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(16,185,129,.12)", color: "#34d399" }}>READ ONLY</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)]">Copilot keputusan bisnis</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {aiMessages.length > 0 && (
                  <button onClick={() => { setAiMessages([]); setAiError(""); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-white/5" title="Percakapan baru">
                    <RotateCcw size={14} />
                  </button>
                )}
                <button onClick={() => setShowAI(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-white/5">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {aiMessages.length === 0 ? (
                <div className="h-full flex flex-col justify-center">
                  <div className="text-center mb-5">
                    <Sparkles size={24} className="text-[#818cf8] mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Mau cek apa hari ini?</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Copilot membaca data bisnis terbaru saat kamu bertanya.</p>
                  </div>
                  <div className="space-y-2">
                    {aiQuickQuestions.map((question) => (
                      <button key={question} onClick={() => void sendAI(question)} className="w-full text-left text-xs leading-5 px-3 py-2.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                aiMessages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[86%] rounded-2xl px-3.5 py-2.5 text-xs leading-5 whitespace-pre-wrap"
                      style={
                        message.role === "user"
                          ? { background: "linear-gradient(135deg,#6366f1,#7c3aed)", color: "white" }
                          : { background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.06)", color: "var(--text-primary)" }
                      }
                    >
                      {message.content}
                    </div>
                  </div>
                ))
              )}

              {aiLoading && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Loader2 size={14} className="animate-spin" /> Membaca data dan menganalisis...
                </div>
              )}
              {aiError && (
                <div className="text-xs text-rose-300 rounded-xl px-3 py-2" style={{ background: "rgba(244,63,94,.08)", border: "1px solid rgba(244,63,94,.2)" }}>
                  {aiError}
                </div>
              )}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void sendAI();
              }}
              className="p-3"
              style={{ borderTop: "1px solid rgba(255,255,255,.07)" }}
            >
              <div className="flex items-end gap-2 rounded-xl p-2" style={{ background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.07)" }}>
                <textarea
                  value={aiInput}
                  onChange={(event) => setAiInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendAI();
                    }
                  }}
                  rows={2}
                  placeholder="Tanya data atau minta saran keputusan..."
                  className="flex-1 resize-none bg-transparent outline-none text-xs leading-5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                  disabled={aiLoading}
                />
                <button type="submit" disabled={!aiInput.trim() || aiLoading} className="w-9 h-9 rounded-lg flex items-center justify-center text-white disabled:opacity-40" style={{ background: "linear-gradient(135deg,#6366f1,#7c3aed)" }}>
                  {aiLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </div>
            </form>
          </section>
        </>
      )}
    </>
  );
}
