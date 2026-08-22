"use client";

import { useState, useEffect, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  Plus,
  Search,
  Upload,
  X,
  Check,
  Copy,
  Loader2,
  Smartphone,
  Monitor,
  LayoutList,
  LayoutGrid,
  Users,
  User,
  ShoppingBag,
  CalendarDays,
  Shield,
  Trash2,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";

interface StockTransaction {
  user: { name: string; email: string; whatsapp: string | null } | null;
  amount: number | null;
  productName: string | null;
  purchaseDate: string | null;
  warrantyExpiredAt: string | null;
  status: string | null;
}

interface StockItem {
  id: string;
  accountEmail: string;
  accountPassword: string;
  status: string | null;
  durationDays: number | null;
  productId: string | null;
  product: { name: string; maxSlots: number | null } | null;
  maxSlots: number | null;
  usedSlots: number | null;
  usageType: string | null;
  notes: string | null;
  createdAt: string | null;
  transactions: StockTransaction[];
}

interface StockResponse {
  accounts: StockItem[];
  total: number;
  statusCounts: Record<string, number>;
  mobileStatusCounts: Record<string, number>;
  mobileTotal: number;
  desktopStatusCounts: Record<string, number>;
  desktopTotal: number;
  remainingSlotsMobile: number;
  remainingSlotsDesktop: number;
}

const statusFilters = ["Semua", "available", "sold"];
const statusLabels: Record<string, string> = { Semua: "Semua", available: "Tersedia", sold: "Sold" };

function getEffectiveStatus(status: string | null, usedSlots: number | null, maxSlots: number | null) {
  const used = usedSlots ?? 0;
  const max = maxSlots ?? 3;
  if (used < max) return "available";
  return "sold";
}

function getStockBadge(status: string | null, usedSlots?: number | null, maxSlots?: number | null) {
  const eff = getEffectiveStatus(status, usedSlots ?? null, maxSlots ?? null);
  switch (eff) {
    case "available": return <span className="badge badge-success">Tersedia</span>;
    case "sold": return <span className="badge badge-neutral">Sold</span>;
    default: return <span className="badge badge-neutral">{eff}</span>;
  }
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function formatCurrency(amount: number | null) {
  if (!amount) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

// ─── Modal Cek Pengguna ───────────────────────────────────────────────────────
function UserCheckModal({ account, onClose }: { account: StockItem; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState(0);

  // Filter transaksi yang punya user (slot terpakai)
  const usedTrx = account.transactions.filter(t => t.user !== null);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 520 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-[#818cf8]" />
            <div>
              <h3 className="font-semibold text-[var(--text-primary)] text-base">Cek Pengguna Akun</h3>
              <p className="text-xs text-(--text-muted) font-mono mt-0.5">{account.accountEmail}</p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Slot summary bar */}
        <div className="px-5 pt-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 bg-[var(--border-color)] rounded-lg h-2 overflow-hidden">
              <div
                className="h-full rounded-lg transition-all"
                style={{
                  width: `${((account.usedSlots || 0) / (account.maxSlots || 3)) * 100}%`,
                  background: (account.usedSlots || 0) >= (account.maxSlots || 3) ? "#ef4444" : "#22c55e",
                }}
              />
            </div>
            <span className="text-xs font-semibold text-(--text-secondary) shrink-0">
              {account.usedSlots || 0}/{account.maxSlots || 3} slot terpakai
            </span>
          </div>

          {usedTrx.length === 0 ? (
            <div className="py-8 text-center">
              <Users size={32} className="mx-auto text-(--text-muted) mb-2 opacity-40" />
              <p className="text-sm text-(--text-muted)">Belum ada pengguna di akun ini</p>
            </div>
          ) : (
            <>
              {/* Tabs: Pengguna 1, 2, 3... */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
                {usedTrx.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveTab(i)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: activeTab === i ? "rgba(129,140,248,0.2)" : "var(--bg-card)",
                      border: `1px solid ${activeTab === i ? "rgba(129,140,248,0.4)" : "var(--border-color)"}`,
                      color: activeTab === i ? "#818cf8" : "var(--text-muted)",
                    }}
                  >
                    <User size={11} />
                    Pengguna {i + 1}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {usedTrx[activeTab] && (() => {
                const trx = usedTrx[activeTab];
                const user = trx.user;
                const warrantyDate = trx.warrantyExpiredAt ? new Date(trx.warrantyExpiredAt) : null;
                const now = new Date();
                const isWarrantyActive = warrantyDate ? warrantyDate > now : false;
                const daysLeft = warrantyDate
                  ? Math.max(0, Math.ceil((warrantyDate.getTime() - now.getTime()) / 86400000))
                  : null;

                return (
                  <div className="space-y-3">
                    {/* User Info Card */}
                    <div className="rounded-xl p-4" style={{ background: "rgba(129,140,248,0.06)", border: "1px solid rgba(129,140,248,0.15)" }}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-full bg-[rgba(129,140,248,0.2)] flex items-center justify-center shrink-0">
                          <User size={14} className="text-[#818cf8]" />
                        </div>
                        <p className="text-xs font-semibold text-[#818cf8] uppercase tracking-wider">Info Pengguna</p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-(--text-muted)">Nama</span>
                          <span className="text-sm font-semibold text-[var(--text-primary)]">{user?.name || "—"}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-(--text-muted)">Email</span>
                          <span className="text-xs text-(--text-secondary) font-mono">{user?.email || "—"}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-(--text-muted)">WhatsApp</span>
                          <span className="text-sm text-(--text-secondary)">{user?.whatsapp || "—"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Transaction Info Card */}
                    <div className="rounded-xl p-4" style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)" }}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-full bg-[rgba(34,197,94,0.15)] flex items-center justify-center shrink-0">
                          <ShoppingBag size={14} className="text-emerald-400" />
                        </div>
                        <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Info Transaksi</p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-(--text-muted)">Produk</span>
                          <span className="text-sm text-(--text-secondary)">{trx.productName || "CapCut Pro"}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-(--text-muted)">Nominal</span>
                          <span className="text-sm font-semibold text-emerald-400">{formatCurrency(trx.amount)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-(--text-muted) flex items-center gap-1"><CalendarDays size={10} /> Tanggal Beli</span>
                          <span className="text-sm text-(--text-secondary)">{formatDate(trx.purchaseDate)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-(--text-muted) flex items-center gap-1"><Shield size={10} /> Garansi s/d</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-(--text-secondary)">{formatDate(trx.warrantyExpiredAt)}</span>
                            {daysLeft !== null && (
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                style={{
                                  background: isWarrantyActive ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                                  color: isWarrantyActive ? "#22c55e" : "#ef4444",
                                }}
                              >
                                {isWarrantyActive ? `${daysLeft}h lagi` : "Expired"}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-(--text-muted)">Status Trx</span>
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-md uppercase"
                            style={{
                              background: trx.status === "success" ? "rgba(34,197,94,0.15)" : "rgba(251,191,36,0.15)",
                              color: trx.status === "success" ? "#22c55e" : "#fbbf24",
                            }}
                          >
                            {trx.status || "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StockPage() {
  // State data
  const [accounts, setAccounts] = useState<StockItem[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({ available: 0, sold: 0 });
  const [mobileStatusCounts, setMobileStatusCounts] = useState<Record<string, number>>({ available: 0, sold: 0 });
  const [mobileTotal, setMobileTotal] = useState(0);
  const [desktopStatusCounts, setDesktopStatusCounts] = useState<Record<string, number>>({ available: 0, sold: 0 });
  const [desktopTotal, setDesktopTotal] = useState(0);
  const [saleStatusCounts, setSaleStatusCounts] = useState<Record<string, number>>({ available: 0, sold: 0 });
  const [saleTotal, setSaleTotal] = useState(0);
  const [warrantyStatusCounts, setWarrantyStatusCounts] = useState<Record<string, number>>({ available: 0, sold: 0 });
  const [warrantyTotal, setWarrantyTotal] = useState(0);
  const [remainingSlotsMobile, setRemainingSlotsMobile] = useState(0);
  const [remainingSlotsDesktop, setRemainingSlotsDesktop] = useState(0);
  const [remainingSlotsSale, setRemainingSlotsSale] = useState(0);
  const [remainingSlotsWarranty, setRemainingSlotsWarranty] = useState(0);

  // Load More
  const [page, setPage] = useState(1);
  const limit = 50;
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [statusFilter, setStatusFilter] = useState("Semua");
  const [productTypeFilter, setProductTypeFilter] = useState("Semua"); // still used for Mobile/Desktop cards
  const [productIdFilter, setProductIdFilter] = useState("Semua");
  const [usageTypeFilter, setUsageTypeFilter] = useState("Semua");
  const [showSingleModal, setShowSingleModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [singleForm, setSingleForm] = useState({ email: "", password: "", duration: 30, productId: "", maxSlots: 3, usageType: "sale", productType: "mobile" });
  const [bulkText, setBulkText] = useState("");
  const [bulkDuration, setBulkDuration] = useState(30);
  const [bulkProductId, setBulkProductId] = useState("");
  const [bulkUsageType, setBulkUsageType] = useState("sale");
  const [bulkProductType, setBulkProductType] = useState("mobile");
  const [products, setProducts] = useState<any[]>([]);
  const [bulkMaxSlots, setBulkMaxSlots] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

  // Cek Pengguna modal
  const [checkAccount, setCheckAccount] = useState<StockItem | null>(null);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState<StockItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (!deleteConfirm) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/stock/${deleteConfirm.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        setDeleteError(json.error || "Gagal menghapus akun");
        setDeleting(false);
        return;
      }
      setDeleteConfirm(null);
      fetchData(1, false);
    } catch {
      setDeleteError("Terjadi kesalahan jaringan");
    }
    setDeleting(false);
  }

  const fetchData = useCallback((pageNum: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter !== "Semua") params.set("status", statusFilter);
    if (productIdFilter !== "Semua") params.set("productId", productIdFilter);
    if (productTypeFilter !== "Semua") params.set("productType", productTypeFilter);
    if (usageTypeFilter !== "Semua") params.set("usageType", usageTypeFilter);
    params.set("page", String(pageNum));
    params.set("limit", String(limit));

    fetch(`/api/stock?${params}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          console.error("[stock] API returned error:", json.error);
        }
        const rawAccounts = json.accounts || [];
        const newAccounts: StockItem[] = rawAccounts.map((item: any) => ({
          ...item,
          accountEmail: item.accountEmail ?? item.account_email ?? "",
          accountPassword: item.accountPassword ?? item.account_password ?? "",
          durationDays: item.durationDays ?? item.duration_days ?? 30,
          maxSlots: item.maxSlots ?? item.max_slots ?? 3,
          usedSlots: item.usedSlots ?? item.used_slots ?? 0,
          productType: item.productType ?? item.product_type ?? "mobile",
          usageType: item.usageType ?? item.usage_type ?? "sale",
          transactions: item.transactions || [],
        }));
        if (append) {
          setAccounts(prev => [...prev, ...newAccounts]);
        } else {
          setAccounts(newAccounts);
        }
        setTotal(json.total || 0);
        setHasMore(newAccounts.length >= limit);
        // Stats always use latest
        const sc: Record<string, number> = { available: 0, sold: 0 };
        (json.statusCounts ? Object.entries(json.statusCounts) : []).forEach(([k, v]) => { sc[k] = v as number; });
        setStatusCounts(sc);

        const msc: Record<string, number> = { available: 0, sold: 0 };
        (json.mobileStatusCounts ? Object.entries(json.mobileStatusCounts) : []).forEach(([k, v]) => { msc[k] = v as number; });
        setMobileStatusCounts(msc);
        setMobileTotal(json.mobileTotal ?? 0);

        const dsc: Record<string, number> = { available: 0, sold: 0 };
        (json.desktopStatusCounts ? Object.entries(json.desktopStatusCounts) : []).forEach(([k, v]) => { dsc[k] = v as number; });
        setDesktopStatusCounts(dsc);
        setDesktopTotal(json.desktopTotal ?? 0);

        const ssc: Record<string, number> = { available: 0, sold: 0 };
        (json.saleStatusCounts ? Object.entries(json.saleStatusCounts) : []).forEach(([k, v]) => { ssc[k] = v as number; });
        setSaleStatusCounts(ssc);
        setSaleTotal(json.saleTotal ?? 0);

        const wsc: Record<string, number> = { available: 0, sold: 0 };
        (json.warrantyStatusCounts ? Object.entries(json.warrantyStatusCounts) : []).forEach(([k, v]) => { wsc[k] = v as number; });
        setWarrantyStatusCounts(wsc);
        setWarrantyTotal(json.warrantyTotal ?? 0);

        setRemainingSlotsMobile(json.remainingSlotsMobile ?? 0);
        setRemainingSlotsDesktop(json.remainingSlotsDesktop ?? 0);
        setRemainingSlotsSale(json.remainingSlotsSale ?? 0);
        setRemainingSlotsWarranty(json.remainingSlotsWarranty ?? 0);
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (append) setLoadingMore(false);
        else setLoading(false);
      });
  }, [debouncedSearch, statusFilter, productIdFilter, productTypeFilter, usageTypeFilter]);

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    fetchData(1, false);
  }, [fetchData]);

  // Product options are static for the lifetime of this page; do not refetch on every filter/search change.
  useEffect(() => {
    fetch("/api/products/list")
      .then(res => res.json())
      .then(json => setProducts(json.products || []))
      .catch(err => console.error("Error fetching products:", err));
  }, []);

  function handleLoadMore() {
    const next = page + 1;
    setPage(next);
    fetchData(next, true);
  }

  async function handleAddSingle() {
    if (!singleForm.email || !singleForm.password) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: singleForm.email,
          password: singleForm.password,
          durationDays: singleForm.duration,
          productId: singleForm.productId === "" ? null : singleForm.productId,
          maxSlots: singleForm.maxSlots,
          usageType: singleForm.usageType,
          productType: singleForm.productType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Gagal menambahkan akun");
        setSubmitting(false);
        return;
      }
    } catch (err) {
      alert("Terjadi kesalahan jaringan");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setShowSingleModal(false);
    setSingleForm({ email: "", password: "", duration: 30, productId: "", maxSlots: 3, usageType: "sale", productType: "mobile" });
    fetchData(1, false);
  }

  async function handleBulkImport() {
    const lines = bulkText.split("\n").filter((l) => l.trim());
    const accounts = lines.map((line) => {
      const [email, password] = line.split(":").map((s) => s.trim());
      return { email, password };
    }).filter((a) => a.email && a.password);
    if (accounts.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          accounts, 
          durationDays: bulkDuration, 
          productId: bulkProductId === "" ? null : bulkProductId, 
          maxSlots: bulkMaxSlots, 
          usageType: bulkUsageType,
          productType: bulkProductType
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Gagal import akun");
        setSubmitting(false);
        return;
      }
    } catch (err) {
      alert("Terjadi kesalahan jaringan");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setShowBulkModal(false);
    setBulkText("");
    fetchData(1, false);
  }

  async function toggleUsageType(id: string, currentType: string) {
    const newType = currentType === "sale" ? "warranty" : "sale";
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, usageType: newType } : a));
    try {
      await fetch(`/api/stock/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usageType: newType }),
      });
    } catch (err) {
      console.error("Error toggling usage type:", err);
      fetchData(page, false);
    }
  }

  function copyPassword(id: string, password: string) {
    navigator.clipboard.writeText(password);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleProductChange(productId: string) {
    const p = products.find(prod => prod.id === productId);
    setSingleForm({ 
      ...singleForm, 
      productId, 
      duration: p?.duration || 30,
      maxSlots: p?.maxSlots || 3,
      productType: p?.maxSlots === 2 ? "desktop" : "mobile"
    });
  }
  function handleBulkProductChange(productId: string) {
    const p = products.find(prod => prod.id === productId);
    setBulkProductId(productId);
    setBulkDuration(p?.duration || 30);
    setBulkMaxSlots(p?.maxSlots || 3);
    setBulkProductType(p?.maxSlots === 2 ? "desktop" : "mobile");
  }

  return (
    <>
      <Topbar title="Stok Akun" subtitle="Kelola stok akun CapCut Pro (Sharing Account)" />

      <div className="px-4 md:px-8 pb-8 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Card 1 — Mobile */}
          <div
            className="glass-card p-4 flex flex-col gap-3 cursor-pointer transition-all"
            style={{
              borderColor: productTypeFilter === "mobile" ? "rgba(34,197,94,0.6)" : "rgba(34,197,94,0.25)",
              background: productTypeFilter === "mobile"
                ? "linear-gradient(135deg,rgba(34,197,94,0.12),rgba(16,185,129,0.08))"
                : "linear-gradient(135deg,rgba(34,197,94,0.05),rgba(16,185,129,0.03))",
              boxShadow: productTypeFilter === "mobile" ? "0 0 0 2px rgba(34,197,94,0.2)" : undefined,
            }}
            onClick={() => setProductTypeFilter(productTypeFilter === "mobile" ? "Semua" : "mobile")}
            title="Klik untuk filter Mobile"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
                  <Smartphone size={16} className="text-green-400" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Mobile</p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg" style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80" }}>{mobileTotal}</span>
            </div>
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-1 pt-1 border-t border-green-500/10">
              <div className="text-center">
                <p className="text-lg font-bold text-emerald-400">{mobileStatusCounts.available || 0}</p>
                <p className="text-[9px] text-(--text-muted)">Ready</p>
              </div>
              <div className="text-center border-l border-green-500/10">
                <p className="text-lg font-bold text-slate-400">{mobileStatusCounts.sold || 0}</p>
                <p className="text-[9px] text-(--text-muted)">Sold</p>
              </div>
              <div className="text-center border-l border-green-500/10">
                <p className="text-lg font-bold text-amber-400">{remainingSlotsMobile}</p>
                <p className="text-[9px] text-(--text-muted)">Slot Sisa</p>
              </div>
            </div>
          </div>

          {/* Card 2 — Desktop */}
          <div
            className="glass-card p-4 flex flex-col gap-3 cursor-pointer transition-all"
            style={{
              borderColor: productTypeFilter === "desktop" ? "rgba(59,130,246,0.6)" : "rgba(59,130,246,0.25)",
              background: productTypeFilter === "desktop"
                ? "linear-gradient(135deg,rgba(59,130,246,0.12),rgba(99,102,241,0.08))"
                : "linear-gradient(135deg,rgba(59,130,246,0.05),rgba(99,102,241,0.03))",
              boxShadow: productTypeFilter === "desktop" ? "0 0 0 2px rgba(59,130,246,0.2)" : undefined,
            }}
            onClick={() => setProductTypeFilter(productTypeFilter === "desktop" ? "Semua" : "desktop")}
            title="Klik untuk filter Desktop"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                  <Monitor size={16} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Desktop</p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg" style={{ background: "rgba(59,130,246,0.12)", color: "#60a5fa" }}>{desktopTotal}</span>
            </div>
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-1 pt-1 border-t border-blue-500/10">
              <div className="text-center">
                <p className="text-lg font-bold text-emerald-400">{desktopStatusCounts.available || 0}</p>
                <p className="text-[9px] text-(--text-muted)">Ready</p>
              </div>
              <div className="text-center border-l border-blue-500/10">
                <p className="text-lg font-bold text-slate-400">{desktopStatusCounts.sold || 0}</p>
                <p className="text-[9px] text-(--text-muted)">Sold</p>
              </div>
              <div className="text-center border-l border-blue-500/10">
                <p className="text-lg font-bold text-amber-400">{remainingSlotsDesktop}</p>
                <p className="text-[9px] text-(--text-muted)">Slot Sisa</p>
              </div>
            </div>
          </div>

          {/* Card 3 — Jualan */}
          <div
            className="glass-card p-4 flex flex-col gap-3 cursor-pointer transition-all"
            style={{
              borderColor: usageTypeFilter === "sale" ? "rgba(167,139,250,0.6)" : "rgba(167,139,250,0.25)",
              background: usageTypeFilter === "sale"
                ? "linear-gradient(135deg,rgba(167,139,250,0.12),rgba(139,92,246,0.08))"
                : "linear-gradient(135deg,rgba(167,139,250,0.05),rgba(139,92,246,0.03))",
              boxShadow: usageTypeFilter === "sale" ? "0 0 0 2px rgba(167,139,250,0.2)" : undefined,
            }}
            onClick={() => setUsageTypeFilter(usageTypeFilter === "sale" ? "Semua" : "sale")}
            title="Klik untuk filter Jualan"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
                  <ShoppingBag size={16} className="text-purple-400" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Jualan</p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg" style={{ background: "rgba(167,139,250,0.12)", color: "#a78bfa" }}>{saleTotal}</span>
            </div>
            <div className="grid grid-cols-3 gap-1 pt-1 border-t border-purple-500/10">
              <div className="text-center">
                <p className="text-lg font-bold text-emerald-400">{saleStatusCounts.available || 0}</p>
                <p className="text-[9px] text-(--text-muted)">Ready</p>
              </div>
              <div className="text-center border-l border-purple-500/10">
                <p className="text-lg font-bold text-slate-400">{saleStatusCounts.sold || 0}</p>
                <p className="text-[9px] text-(--text-muted)">Sold</p>
              </div>
              <div className="text-center border-l border-purple-500/10">
                <p className="text-lg font-bold text-amber-400">{remainingSlotsSale}</p>
                <p className="text-[9px] text-(--text-muted)">Slot Sisa</p>
              </div>
            </div>
          </div>

          {/* Card 4 — Garansi */}
          <div
            className="glass-card p-4 flex flex-col gap-3 cursor-pointer transition-all"
            style={{
              borderColor: usageTypeFilter === "warranty" ? "rgba(244,114,182,0.6)" : "rgba(244,114,182,0.25)",
              background: usageTypeFilter === "warranty"
                ? "linear-gradient(135deg,rgba(244,114,182,0.12),rgba(236,72,153,0.08))"
                : "linear-gradient(135deg,rgba(244,114,182,0.05),rgba(236,72,153,0.03))",
              boxShadow: usageTypeFilter === "warranty" ? "0 0 0 2px rgba(244,114,182,0.2)" : undefined,
            }}
            onClick={() => setUsageTypeFilter(usageTypeFilter === "warranty" ? "Semua" : "warranty")}
            title="Klik untuk filter Garansi"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-pink-500/15 flex items-center justify-center shrink-0">
                  <Shield size={16} className="text-pink-400" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-pink-400 uppercase tracking-wider">Garansi</p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg" style={{ background: "rgba(244,114,182,0.12)", color: "#f472b6" }}>{warrantyTotal}</span>
            </div>
            <div className="grid grid-cols-3 gap-1 pt-1 border-t border-pink-500/10">
              <div className="text-center">
                <p className="text-lg font-bold text-emerald-400">{warrantyStatusCounts.available || 0}</p>
                <p className="text-[9px] text-(--text-muted)">Ready</p>
              </div>
              <div className="text-center border-l border-pink-500/10">
                <p className="text-lg font-bold text-slate-400">{warrantyStatusCounts.sold || 0}</p>
                <p className="text-[9px] text-(--text-muted)">Sold</p>
              </div>
              <div className="text-center border-l border-pink-500/10">
                <p className="text-lg font-bold text-amber-400">{remainingSlotsWarranty}</p>
                <p className="text-[9px] text-(--text-muted)">Slot Sisa</p>
              </div>
            </div>
          </div>

          {/* Card 5 — Overall */}
          <div
            className="glass-card p-4 flex flex-col gap-3"
            style={{ borderColor: "rgba(129,140,248,0.25)", background: "linear-gradient(135deg,rgba(129,140,248,0.06),rgba(99,102,241,0.03))" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0">
                  <LayoutGrid size={16} className="text-indigo-400" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Total</p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg" style={{ background: "rgba(129,140,248,0.12)", color: "#818cf8" }}>{(statusCounts.available || 0) + (statusCounts.sold || 0)}</span>
            </div>
            <div className="grid grid-cols-3 gap-1 pt-1 border-t border-indigo-500/10">
              <div className="text-center">
                <p className="text-lg font-bold text-emerald-400">{statusCounts.available || 0}</p>
                <p className="text-[9px] text-(--text-muted)">Ready</p>
              </div>
              <div className="text-center border-l border-indigo-500/10">
                <p className="text-lg font-bold text-slate-400">{statusCounts.sold || 0}</p>
                <p className="text-[9px] text-(--text-muted)">Sold</p>
              </div>
              <div className="text-center border-l border-indigo-500/10">
                <p className="text-lg font-bold text-amber-400">{remainingSlotsMobile + remainingSlotsDesktop}</p>
                <p className="text-[9px] text-(--text-muted)">Slot Sisa</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Actions toolbar ─────────────────────────────────────────── */}
        <div className="space-y-3">
          {/* Row 1: Search + Buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="search-box flex-1 min-w-[160px] max-w-md">
              <Search size={16} className="search-icon" />
              <input type="text" placeholder="Cari email akun..." className="form-input pl-10!" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-2 ml-auto">
              <button className="btn-secondary" onClick={() => setShowBulkModal(true)}><Upload size={16} /> <span className="hidden sm:inline">Bulk Import</span></button>
              <button className="btn-primary" onClick={() => setShowSingleModal(true)}><Plus size={16} /> <span className="hidden sm:inline">Tambah Akun</span></button>
            </div>
          </div>
          {/* Row 2: Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <select
              className="form-input py-2! px-3! text-sm max-w-[180px] cursor-pointer"
              value={productIdFilter}
              onChange={(e) => { setProductIdFilter(e.target.value); setProductTypeFilter("Semua"); }}
            >
              <option value="Semua">Semua Produk</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            
            <select
              className="form-input py-2! px-3! text-sm max-w-[180px] cursor-pointer"
              value={usageTypeFilter}
              onChange={(e) => setUsageTypeFilter(e.target.value)}
            >
              <option value="Semua">Semua Peruntukan</option>
              <option value="sale">Jualan</option>
              <option value="warranty">Claim Garansi</option>
            </select>
            
            <select
              className="form-input py-2! px-3! text-sm max-w-[180px] cursor-pointer"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="Semua">Semua Status</option>
              <option value="available">Tersedia</option>
              <option value="sold">Sold</option>
              <option value="full">Full Slot</option>
            </select>
          </div>
        </div>

        {/* View Toggle mobile */}
        <div className="flex items-center justify-between lg:hidden">
          <p className="text-xs text-(--text-muted)">Total {total} akun</p>
          <div className="flex gap-1">
            <button className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}><LayoutList size={13} /> Tabel</button>
            <button className={`view-toggle-btn ${viewMode === 'card' ? 'active' : ''}`} onClick={() => setViewMode('card')}><LayoutGrid size={13} /> Card</button>
          </div>
        </div>

        {/* Table */}
        <div className="glass-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-[#818cf8]" />
              <span className="ml-2 text-(--text-secondary)">Memuat...</span>
            </div>
          ) : (
            <>
              {viewMode === 'table' && (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Tipe</th>
                        <th>Peruntukan</th>
                        <th>Email Akun</th>
                        <th>Password</th>
                        <th>Slot</th>
                        <th>Durasi</th>
                        <th>Pengguna</th>
                        <th>Ditambahkan</th>
                        <th className="sticky-col-head">Status</th>
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.length === 0 ? (
                        <tr><td colSpan={10} className="text-center py-8 text-(--text-muted)">Belum ada stok akun</td></tr>
                      ) : accounts.map((item) => {
                        const usedTrx = item.transactions.filter(t => t.user !== null);
                        return (
                          <tr key={item.id}>
                            <td><span className="flex flex-col"><span className="flex items-center gap-1.5 text-xs font-bold">{(item.product?.maxSlots || item.maxSlots) === 2 ? <><Monitor size={14} className="text-blue-400" />Desktop</> : <><Smartphone size={14} className="text-green-400" />Mobile</>}</span><span className="text-[10px] text-(--text-muted) truncate max-w-[100px]">{item.product?.name || "-"}</span></span></td>
                            <td>
                              <button 
                                onClick={() => toggleUsageType(item.id, item.usageType || "sale")}
                                className="transition-transform active:scale-95"
                                title="Klik untuk ganti peruntukan"
                              >
                                {item.usageType === "warranty" ? (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold hover:brightness-110" style={{ background: "rgba(236,72,153,0.15)", color: "#f472b6", border: "1px solid rgba(236,72,153,0.3)" }}>
                                    <Shield size={10} /> Garansi
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold hover:brightness-110" style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }}>
                                    <ShoppingBag size={10} /> Jualan
                                  </span>
                                )}
                              </button>
                            </td>
                            <td className="font-mono text-sm">{item.accountEmail}</td>
                            <td>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm text-(--text-secondary)">••••••••</span>
                                <button className="btn-icon" style={{ width: 28, height: 28 }} title="Copy Password" onClick={() => copyPassword(item.id, item.accountPassword)}>
                                  {copiedId === item.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                                </button>
                              </div>
                            </td>
                            <td>
                              <div className="flex items-center gap-1.5">
                                <div className="w-12 h-1.5 bg-[var(--border-color)] rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all" style={{ width: `${(item.usedSlots || 0) / (item.maxSlots || 3) * 100}%`, background: (item.usedSlots || 0) >= (item.maxSlots || 3) ? "#ef4444" : "#22c55e" }} />
                                </div>
                                <span className="text-xs font-medium text-(--text-secondary)">{item.usedSlots || 0}/{item.maxSlots || 3}</span>
                              </div>
                            </td>
                            <td className="text-sm">{item.durationDays || 30} Hari</td>
                            <td>
                              {usedTrx.length > 0 ? (
                                <button
                                  onClick={() => setCheckAccount(item)}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                  style={{
                                    background: "rgba(129,140,248,0.1)",
                                    border: "1px solid rgba(129,140,248,0.25)",
                                    color: "#818cf8",
                                  }}
                                >
                                  <Users size={12} />
                                  {usedTrx.length} Pengguna
                                </button>
                              ) : (
                                <span className="text-sm text-(--text-muted)">—</span>
                              )}
                            </td>
                            <td className="text-(--text-secondary) text-sm">{item.createdAt ? new Date(item.createdAt).toLocaleDateString("id-ID") : "—"}</td>
                            <td className="sticky-col-body">{getStockBadge(item.status, item.usedSlots, item.maxSlots)}</td>
                            <td>
                              <button
                                onClick={() => { setDeleteConfirm(item); setDeleteError(null); }}
                                className="btn-icon hover:text-rose-400 hover:bg-rose-500/10"
                                style={{ width: 30, height: 30 }}
                                title="Hapus akun"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {viewMode === 'card' && (
                <div className="data-card-grid">
                  {accounts.length === 0 ? <p className="text-center py-8 text-(--text-muted)">Belum ada stok akun</p> : accounts.map((item) => {
                    const usedTrx = item.transactions.filter(t => t.user !== null);
                    return (
                      <div key={item.id} className="data-card">
                        <div className="flex items-start justify-between mb-3">
                          <div className="min-w-0 flex-1 mr-2">
                            <p className="font-mono text-sm text-[var(--text-primary)] truncate">{item.accountEmail}</p>
                            <span className="flex items-center gap-1 text-xs font-medium mt-1 text-(--text-muted)">
                              {(item.product?.maxSlots || item.maxSlots) === 2 ? <><Monitor size={12} className="text-blue-400" />Desktop</> : <><Smartphone size={12} className="text-green-400" />Mobile</>}
                            </span>
                             <div className="mt-1.5">
                               <button 
                                 onClick={() => toggleUsageType(item.id, item.usageType || "sale")}
                                 className="transition-transform active:scale-95"
                               >
                                 {item.usageType === "warranty" ? (
                                   <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: "rgba(236,72,153,0.15)", color: "#f472b6", border: "1px solid rgba(236,72,153,0.3)" }}>
                                     <Shield size={9} /> Garansi
                                   </span>
                                 ) : (
                                   <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }}>
                                     <ShoppingBag size={9} /> Jualan
                                   </span>
                                 )}
                               </button>
                             </div>
                            <p className="text-[10px] text-(--text-muted) mt-1">{item.product?.name || "-"}</p>
                          </div>
                          {getStockBadge(item.status, item.usedSlots, item.maxSlots)}
                        </div>
                        <div className="space-y-1.5 pt-2.5 border-t border-[rgba(99,102,241,0.08)]">
                          <div className="data-card-row">
                            <span className="data-card-label">Slot</span>
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-[var(--border-color)] rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${(item.usedSlots || 0) / (item.maxSlots || 3) * 100}%`, background: (item.usedSlots || 0) >= (item.maxSlots || 3) ? "#ef4444" : "#22c55e" }} />
                              </div>
                              <span className="text-xs text-(--text-secondary)">{item.usedSlots || 0}/{item.maxSlots || 3}</span>
                            </div>
                          </div>
                          <div className="data-card-row"><span className="data-card-label">Durasi</span><span className="data-card-value">{item.durationDays || 30} Hari</span></div>
                          <div className="data-card-row">
                            <span className="data-card-label">Password</span>
                            <span className="data-card-value flex items-center gap-1.5">••••••••
                              <button className="btn-icon" style={{ width: 22, height: 22 }} onClick={() => copyPassword(item.id, item.accountPassword)}>
                                {copiedId === item.id ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                              </button>
                            </span>
                          </div>
                          <div className="data-card-row">
                            <span className="data-card-label">Pengguna</span>
                            {usedTrx.length > 0 ? (
                              <button
                                onClick={() => setCheckAccount(item)}
                                className="flex items-center gap-1 text-xs font-semibold"
                                style={{ color: "#818cf8" }}
                              >
                                <Users size={11} /> {usedTrx.length} Orang
                              </button>
                            ) : <span className="data-card-value">—</span>}
                          </div>
                          <div className="data-card-row"><span className="data-card-label">Ditambahkan</span><span className="data-card-value">{item.createdAt ? new Date(item.createdAt).toLocaleDateString("id-ID") : "—"}</span></div>
                          <div className="pt-2 border-t border-[rgba(99,102,241,0.08)] mt-1">
                            <button
                              onClick={() => { setDeleteConfirm(item); setDeleteError(null); }}
                              className="flex items-center gap-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 transition-colors"
                            >
                              <Trash2 size={13} /> Hapus Akun
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* ── Load More Footer ── */}
              <div className="flex flex-col sm:flex-row items-center justify-between px-4 md:px-6 py-4 border-t border-[rgba(99,102,241,0.08)] gap-3">
                <p className="text-sm text-[var(--text-muted)]">Menampilkan <span className="font-semibold text-[var(--text-primary)]">{accounts.length}</span> dari <span className="font-semibold text-[var(--text-primary)]">{total}</span> akun</p>
                {hasMore && !loading ? (
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                    style={{
                      background: "rgba(99,102,241,0.1)",
                      border: "1px solid rgba(99,102,241,0.25)",
                      color: "#818cf8",
                      cursor: loadingMore ? "wait" : "pointer",
                    }}
                  >
                    {loadingMore ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}
                    {loadingMore ? "Memuat..." : `Tampilkan ${Math.min(limit, total - accounts.length)} akun berikutnya`}
                  </button>
                ) : !loading && accounts.length > 0 ? (
                  <span className="text-xs text-(--text-muted) flex items-center gap-1.5">
                    <Check size={12} className="text-emerald-400" /> Semua data sudah ditampilkan
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal Cek Pengguna */}
      {checkAccount && (
        <UserCheckModal account={checkAccount} onClose={() => setCheckAccount(null)} />
      )}

      {/* Modal Tambah Single */}
      {showSingleModal && (
        <div className="modal-overlay" onClick={() => setShowSingleModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="font-semibold text-[var(--text-primary)] text-lg">Tambah Stok Akun</h3>
              <button className="btn-icon" onClick={() => setShowSingleModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              <div><label className="form-label">Email Akun</label><input type="email" className="form-input" placeholder="email@capcut.com" value={singleForm.email} onChange={(e) => setSingleForm({ ...singleForm, email: e.target.value })} /></div>
              <div><label className="form-label">Password Akun</label><input type="text" className="form-input" placeholder="Masukkan password" value={singleForm.password} onChange={(e) => setSingleForm({ ...singleForm, password: e.target.value })} /></div>
              <div>
                <label className="form-label">Produk Terkait</label>
                <select 
                  className="form-input" 
                  value={singleForm.productId} 
                  onChange={(e) => handleProductChange(e.target.value)}
                >
                  <option value="">Pilih Produk</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.maxSlots === 2 ? "Desktop" : "Mobile"})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Slot Pengguna</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setSingleForm({ ...singleForm, maxSlots: n })}
                      className={`w-10 h-10 rounded-lg text-sm font-bold border transition-all ${singleForm.maxSlots === n ? "border-(--accent) bg-[rgba(99,102,241,0.15)] text-(--accent)" : "border-[var(--border-color)] text-(--text-muted) hover:border-[var(--border-active)]"}`}>
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-(--text-muted) mt-1">
                  {products.find(p => p.id === singleForm.productId)?.maxSlots === 2 ? "Rekomendasi: 2 slot untuk Laptop/Mac/Desktop" : "Rekomendasi: 3 slot untuk HP/iPad/Tablet"}
                </p>
              </div>
              <div>
                <label className="form-label">Tipe Perangkat</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSingleForm({ ...singleForm, productType: "mobile" })}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-all ${singleForm.productType === "mobile" ? "border-green-500 bg-green-500/10 text-green-400" : "border-[var(--border-color)] text-(--text-muted)"}`}>
                    <Smartphone size={14} /> Mobile
                  </button>
                  <button type="button" onClick={() => setSingleForm({ ...singleForm, productType: "desktop" })}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-all ${singleForm.productType === "desktop" ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-[var(--border-color)] text-(--text-muted)"}`}>
                    <Monitor size={14} /> Desktop
                  </button>
                </div>
              </div>
              <div>
                <label className="form-label">Peruntukan Stok</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSingleForm({ ...singleForm, usageType: "sale" })}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-all ${singleForm.usageType === "sale" ? "border-[#a78bfa] bg-[rgba(139,92,246,0.15)] text-[#a78bfa]" : "border-[var(--border-color)] text-(--text-muted)"}`}>
                    <ShoppingBag size={14} /> Stok Jualan
                  </button>
                  <button type="button" onClick={() => setSingleForm({ ...singleForm, usageType: "warranty" })}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-all ${singleForm.usageType === "warranty" ? "border-[#f472b6] bg-[rgba(236,72,153,0.15)] text-[#f472b6]" : "border-[var(--border-color)] text-(--text-muted)"}`}>
                    <Shield size={14} /> Stok Garansi
                  </button>
                </div>
              </div>
              <div>
                <label className="form-label">Durasi Langganan</label>
                <div className="relative">
                  <input 
                    type="number" 
                    min="1"
                    className="form-input pr-12" 
                    value={singleForm.duration || ""} 
                    onChange={(e) => setSingleForm({ ...singleForm, duration: parseInt(e.target.value) || 0 })} 
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-(--text-muted) pointer-events-none">Hari</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowSingleModal(false)}>Batal</button>
              <button className="btn-primary" onClick={handleAddSingle} disabled={submitting}>{submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Simpan</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Bulk Import */}
      {showBulkModal && (
        <div className="modal-overlay" onClick={() => setShowBulkModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="font-semibold text-[var(--text-primary)] text-lg">Bulk Import Stok Akun</h3>
              <button className="btn-icon" onClick={() => setShowBulkModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              <p className="text-sm text-(--text-secondary)">Paste daftar akun dengan format: <code className="text-[#818cf8]">email:password</code> (satu per baris)</p>
              <div><label className="form-label">Daftar Akun</label><textarea className="form-input" rows={8} placeholder={"akun1@mail.com:password1\nakun2@mail.com:password2"} value={bulkText} onChange={(e) => setBulkText(e.target.value)} /></div>
              <div>
                <label className="form-label">Produk Terkait</label>
                <select 
                  className="form-input" 
                  value={bulkProductId} 
                  onChange={(e) => handleBulkProductChange(e.target.value)}
                >
                  <option value="">Pilih Produk</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.maxSlots === 2 ? "Desktop" : "Mobile"})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Tipe Perangkat</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setBulkProductType("mobile")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-all ${bulkProductType === "mobile" ? "border-green-500 bg-green-500/10 text-green-400" : "border-[var(--border-color)] text-(--text-muted)"}`}>
                    <Smartphone size={14} /> Mobile
                  </button>
                  <button type="button" onClick={() => setBulkProductType("desktop")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-all ${bulkProductType === "desktop" ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-[var(--border-color)] text-(--text-muted)"}`}>
                    <Monitor size={14} /> Desktop
                  </button>
                </div>
              </div>
              <div>
                <label className="form-label">Slot Pengguna</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setBulkMaxSlots(n)}
                      className={`w-10 h-10 rounded-lg text-sm font-bold border transition-all ${bulkMaxSlots === n ? "border-(--accent) bg-[rgba(99,102,241,0.15)] text-(--accent)" : "border-[var(--border-color)] text-(--text-muted) hover:border-[var(--border-active)]"}`}>
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-(--text-muted) mt-1">
                  {products.find(p => p.id === bulkProductId)?.maxSlots === 2 ? "Rekomendasi: 2 slot untuk Laptop/Mac/Desktop" : "Rekomendasi: 3 slot untuk HP/iPad/Tablet"}
                </p>
              </div>
              <div>
                <label className="form-label">Peruntukan Stok</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setBulkUsageType("sale")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-all ${bulkUsageType === "sale" ? "border-[#a78bfa] bg-[rgba(139,92,246,0.15)] text-[#a78bfa]" : "border-[var(--border-color)] text-(--text-muted)"}`}>
                    <ShoppingBag size={14} /> Stok Jualan
                  </button>
                  <button type="button" onClick={() => setBulkUsageType("warranty")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-all ${bulkUsageType === "warranty" ? "border-[#f472b6] bg-[rgba(236,72,153,0.15)] text-[#f472b6]" : "border-[var(--border-color)] text-(--text-muted)"}`}>
                    <Shield size={14} /> Stok Garansi
                  </button>
                </div>
              </div>
              <div>
                <label className="form-label">Durasi Langganan</label>
                <div className="relative">
                  <input 
                    type="number" 
                    min="1"
                    className="form-input pr-12" 
                    value={bulkDuration || ""} 
                    onChange={(e) => setBulkDuration(parseInt(e.target.value) || 0)} 
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)] pointer-events-none">Hari</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowBulkModal(false)}>Batal</button>
              <button className="btn-primary" onClick={handleBulkImport} disabled={submitting}>{submitting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Import Semua</button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Konfirmasi Hapus */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => { if (!deleting) { setDeleteConfirm(null); setDeleteError(null); } }}>
          <div
            className="modal-content"
            style={{ maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-rose-500/15 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={18} className="text-rose-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)]">Hapus Stok Akun?</h3>
                  <p className="text-xs text-[var(--text-muted)]">Tindakan ini tidak bisa dibatalkan</p>
                </div>
              </div>
              <button className="btn-icon" onClick={() => { setDeleteConfirm(null); setDeleteError(null); }} disabled={deleting}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body space-y-4">
              {/* Akun info */}
              <div
                className="p-3 rounded-xl"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)" }}
              >
                <p className="text-xs text-[var(--text-muted)] mb-1">Akun yang akan dihapus:</p>
                <p className="font-mono text-sm text-[var(--text-primary)]">{deleteConfirm.accountEmail}</p>
                <div className="flex items-center gap-3 mt-2">
                  {getStockBadge(deleteConfirm.status, deleteConfirm.usedSlots, deleteConfirm.maxSlots)}
                  <span className="text-xs text-[var(--text-muted)]">
                    {deleteConfirm.usedSlots || 0}/{deleteConfirm.maxSlots || 3} slot terpakai
                  </span>
                </div>
              </div>

              {/* Warning jika ada slot terpakai */}
              {(deleteConfirm.usedSlots ?? 0) > 0 && (
                <div
                  className="flex items-start gap-2 p-3 rounded-xl"
                  style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}
                >
                  <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300">
                    Akun ini masih dipakai <strong>{deleteConfirm.usedSlots} pelanggan</strong>.
                    Pastikan slot sudah kosong sebelum menghapus.
                  </p>
                </div>
              )}

              {/* Error message */}
              {deleteError && (
                <div
                  className="flex items-start gap-2 p-3 rounded-xl"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
                >
                  <AlertTriangle size={14} className="text-rose-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-300">{deleteError}</p>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => { setDeleteConfirm(null); setDeleteError(null); }}
                disabled={deleting}
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
                style={{
                  background: "linear-gradient(135deg,#ef4444,#dc2626)",
                  border: "1px solid rgba(239,68,68,0.4)",
                  boxShadow: "0 4px 15px rgba(239,68,68,0.25)",
                  cursor: deleting ? "wait" : "pointer",
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deleting ? "Menghapus..." : "Ya, Hapus Akun"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
