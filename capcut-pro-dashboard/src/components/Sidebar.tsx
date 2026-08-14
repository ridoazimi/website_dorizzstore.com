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
  History,
  SquarePen,
  Trash2,
  ChevronLeft,
} from "lucide-react";
import type { PermissionKey } from "@/lib/auth-shared";

type AIMessage = {
  role: "user" | "assistant";
  content: string;
};

type AIConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: string | null;
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
  "Siapa customer yang expired hari ini? Tampilkan nama dan nomor WhatsApp.",
  "Analisis target market kita dari produk, source, dan tipe customer 30 hari terakhir.",
  "Berapa transaksi sukses, pending, dan gagal hari ini?",
  "Bagaimana kondisi stok sekarang? Perlu restok apa?",
];

async function readJsonResponse(res: Response): Promise<JsonRecord> {
  const raw = await res.text();
  if (!raw.trim()) throw new Error(`Server Dorizz AI tidak mengembalikan data (HTTP ${res.status}).`);
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

function formatHistoryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const [historyError, setHistoryError] = useState("");
  const [showAIHistory, setShowAIHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConversationTitle, setActiveConversationTitle] = useState<string | null>(null);

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

  async function loadAIHistory() {
    if (!canUseAI) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await fetch("/api/ai/conversations", { cache: "no-store" });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Gagal mengambil riwayat.");
      setConversations(Array.isArray(data.conversations) ? data.conversations as unknown as AIConversation[] : []);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Riwayat percakapan gagal dimuat.");
    } finally {
      setHistoryLoading(false);
    }
  }

  function startNewConversation() {
    setActiveConversationId(null);
    setActiveConversationTitle(null);
    setAiMessages([]);
    setAiInput("");
    setAiError("");
    setHistoryError("");
    setShowAIHistory(false);
  }

  async function openConversation(id: string) {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await fetch(`/api/ai/conversations/${id}`, { cache: "no-store" });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Percakapan gagal dibuka.");
      const conversation = data.conversation as Record<string, unknown> | undefined;
      const rawMessages = Array.isArray(data.messages) ? data.messages as Array<Record<string, unknown>> : [];
      const loadedMessages: AIMessage[] = rawMessages
        .filter((item) => (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
        .map((item) => ({ role: item.role as AIMessage["role"], content: String(item.content) }));

      setActiveConversationId(id);
      setActiveConversationTitle(typeof conversation?.title === "string" ? conversation.title : "Percakapan");
      setAiMessages(loadedMessages);
      setAiError("");
      setShowAIHistory(false);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Percakapan gagal dibuka.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function deleteConversation(id: string) {
    if (!window.confirm("Hapus riwayat percakapan ini?")) return;
    try {
      const res = await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Gagal menghapus percakapan.");
      if (activeConversationId === id) startNewConversation();
      await loadAIHistory();
      setShowAIHistory(true);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Gagal menghapus percakapan.");
    }
  }

  async function persistAITurn(userText: string, assistantText: string) {
    try {
      let conversationId = activeConversationId;
      let title = activeConversationTitle;

      if (!conversationId) {
        const createRes = await fetch("/api/ai/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: userText }),
        });
        const createData = await readJsonResponse(createRes);
        if (!createRes.ok) throw new Error(typeof createData.error === "string" ? createData.error : "Gagal membuat riwayat.");
        const conversation = createData.conversation as Record<string, unknown> | undefined;
        conversationId = typeof conversation?.id === "string" ? conversation.id : null;
        title = typeof conversation?.title === "string" ? conversation.title : userText.slice(0, 120);
        if (!conversationId) throw new Error("ID percakapan tidak tersedia.");
        setActiveConversationId(conversationId);
        setActiveConversationTitle(title);
      }

      const saveRes = await fetch(`/api/ai/conversations/${conversationId}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: userText, assistant: assistantText }),
      });
      const saveData = await readJsonResponse(saveRes);
      if (!saveRes.ok) throw new Error(typeof saveData.error === "string" ? saveData.error : "Riwayat gagal disimpan.");
      setHistoryError("");
      void loadAIHistory();
    } catch (error) {
      console.error("Dorizz AI history save error:", error);
      setHistoryError("Jawaban berhasil, tetapi riwayat percakapan belum tersimpan. Coba refresh lalu kirim lagi jika perlu.");
    }
  }

  async function sendAI(question?: string) {
    const text = (question ?? aiInput).trim();
    if (!text || aiLoading) return;

    const nextMessages: AIMessage[] = [...aiMessages, { role: "user", content: text }];
    setAiMessages(nextMessages);
    setAiInput("");
    setAiError("");
    setHistoryError("");
    setAiLoading(true);

    try {
      const res = await fetch("/api/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        cache: "no-store",
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data = await readJsonResponse(res);
      const errorMessage = typeof data.error === "string" ? data.error : "AI gagal merespons";
      if (!res.ok) throw new Error(errorMessage);

      const answer = typeof data.answer === "string" ? data.answer.trim() : "";
      if (!answer) throw new Error("Dorizz AI tidak mengembalikan jawaban.");

      setAiMessages((current) => [...current, { role: "assistant", content: answer }]);
      await persistAITurn(text, answer);
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
                setShowAIHistory(false);
                void loadAIHistory();
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
            <div className="flex items-center gap-3 px-4 py-4 border-b border-[rgba(129,140,248,.15)]">
              {showAIHistory ? (
                <button onClick={() => setShowAIHistory(false)} className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]" title="Kembali ke chat">
                  <ChevronLeft size={18} />
                </button>
              ) : (
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(99,102,241,.15)" }}>
                  <Bot size={21} className="text-[#818cf8]" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-[var(--text-primary)]">{showAIHistory ? "Riwayat Dorizz AI" : "Dorizz AI"}</h2>
                  {!showAIHistory && <span className="text-[9px] font-bold tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">READ ONLY</span>}
                </div>
                <p className="text-xs text-[var(--text-muted)] truncate">
                  {showAIHistory ? `${conversations.length} percakapan tersimpan` : activeConversationTitle || "Copilot keputusan bisnis"}
                </p>
              </div>
              {!showAIHistory && (
                <button
                  onClick={() => {
                    setShowAIHistory(true);
                    void loadAIHistory();
                  }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]"
                  title="Riwayat percakapan"
                >
                  <History size={16} />
                </button>
              )}
              <button
                onClick={startNewConversation}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]"
                title="Chat baru"
              >
                <SquarePen size={16} />
              </button>
              <button onClick={() => setShowAI(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]" aria-label="Tutup">
                <X size={18} />
              </button>
            </div>

            {showAIHistory ? (
              <div className="flex-1 overflow-y-auto p-3">
                {historyLoading && conversations.length === 0 ? (
                  <div className="h-full flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]"><Loader2 size={16} className="animate-spin" /> Memuat riwayat...</div>
                ) : conversations.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-8">
                    <History size={28} className="text-[#818cf8] mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Belum ada riwayat</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">Percakapan akan otomatis tersimpan setelah Dorizz AI selesai menjawab.</p>
                    <button onClick={startNewConversation} className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg,#6366f1,#7c3aed)" }}>Mulai chat baru</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {conversations.map((conversation) => (
                      <div
                        key={conversation.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => void openConversation(conversation.id)}
                        onKeyDown={(event) => { if (event.key === "Enter") void openConversation(conversation.id); }}
                        className={`group rounded-xl border p-3 cursor-pointer transition-colors ${activeConversationId === conversation.id ? "bg-[rgba(99,102,241,.11)] border-[rgba(129,140,248,.3)]" : "bg-white/[.025] border-white/[.07] hover:bg-white/[.045] hover:border-white/[.12]"}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{conversation.title}</p>
                            <p className="text-[11px] text-[var(--text-muted)] mt-1 line-clamp-2 leading-relaxed">{conversation.lastMessage || "Percakapan Dorizz AI"}</p>
                            <div className="flex items-center gap-2 mt-2 text-[10px] text-[var(--text-muted)]">
                              <span>{formatHistoryTime(conversation.updatedAt)}</span>
                              <span>•</span>
                              <span>{conversation.messageCount} pesan</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteConversation(conversation.id);
                            }}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 opacity-60 group-hover:opacity-100"
                            title="Hapus percakapan"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {historyError && <div className="mt-3 rounded-xl px-3.5 py-3 text-xs border border-amber-500/25 bg-amber-500/[.08] text-amber-300">{historyError}</div>}
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {aiMessages.length === 0 && !aiLoading && (
                    <div className="space-y-4">
                      <div className="rounded-xl p-4 border border-[rgba(129,140,248,.12)] bg-white/[.02]">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles size={15} className="text-[#818cf8]" />
                          <p className="text-sm font-medium text-[var(--text-primary)]">Tanya data atau keputusan bisnis</p>
                        </div>
                        <p className="text-xs leading-relaxed text-[var(--text-muted)]">Chat akan tersimpan otomatis. Kamu bisa membuka dan melanjutkannya lagi dari menu Riwayat.</p>
                      </div>
                      <div className="space-y-2">
                        {aiQuickQuestions.map((question) => (
                          <button
                            key={question}
                            onClick={() => sendAI(question)}
                            className="w-full text-left text-xs leading-relaxed rounded-xl px-3.5 py-3 border border-[rgba(129,140,248,.14)] bg-white/[.025] text-[var(--text-secondary)] hover:bg-[rgba(99,102,241,.08)] hover:border-[rgba(129,140,248,.28)] transition-colors"
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiMessages.map((message, index) => (
                    <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${message.role === "user" ? "text-white rounded-br-md" : "text-[var(--text-secondary)] border border-white/[.08] bg-white/[.035] rounded-bl-md"}`}
                        style={message.role === "user" ? { background: "linear-gradient(135deg,#6366f1,#7c3aed)" } : undefined}
                      >
                        {message.content}
                      </div>
                    </div>
                  ))}

                  {aiLoading && (
                    <div className="flex justify-start">
                      <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md px-4 py-3 border border-white/[.08] bg-white/[.035] text-sm text-[var(--text-muted)]">
                        <Loader2 size={15} className="animate-spin" /> Membaca data bisnis...
                      </div>
                    </div>
                  )}

                  {aiError && <div className="rounded-xl px-3.5 py-3 text-xs leading-relaxed border border-rose-500/25 bg-rose-500/[.08] text-rose-300">{aiError}</div>}
                  {historyError && <div className="rounded-xl px-3.5 py-3 text-xs leading-relaxed border border-amber-500/25 bg-amber-500/[.08] text-amber-300">{historyError}</div>}
                </div>

                <div className="p-3 border-t border-[rgba(129,140,248,.15)]">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      sendAI();
                    }}
                    className="flex gap-2 rounded-xl border border-white/[.1] bg-white/[.035] p-2 focus-within:border-[rgba(129,140,248,.4)]"
                  >
                    <textarea
                      value={aiInput}
                      onChange={(event) => setAiInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          sendAI();
                        }
                      }}
                      rows={1}
                      placeholder="Tanya data atau minta saran keputusan..."
                      className="flex-1 resize-none bg-transparent outline-none px-2 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] max-h-24"
                    />
                    <button
                      type="submit"
                      disabled={aiLoading || !aiInput.trim()}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ background: "linear-gradient(135deg,#6366f1,#7c3aed)" }}
                      aria-label="Kirim pertanyaan"
                    >
                      {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  </form>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
