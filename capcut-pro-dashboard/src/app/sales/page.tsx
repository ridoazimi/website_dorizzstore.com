"use client";

import { useState, useEffect, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { usePrivacy } from "@/context/PrivacyContext";
import { useTheme } from "@/context/ThemeContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  Plus,
  Search,
  X,
  UserPlus,
  Loader2,
  Users,
  ArrowUpDown,
  Link2,
  Copy,
  Check,
  Edit2,
  Trash2,
  TrendingUp,
  DollarSign,
  Briefcase,
} from "lucide-react";

interface SalesItem {
  id: string;
  name: string;
  code: string;
  whatsapp: string | null;
  status: string;
  password?: string | null;
  category?: string | null;
  createdAt: string;
  totalClosing: number;
  totalAllClosing: number;
  totalRevenue: number;
}

interface TransactionItem {
  id: string;
  amount: number;
  productName: string | null;
  status: string | null;
  purchaseDate: string | null;
  voucherCode: string | null;
  stockAccount?: {
    accountEmail: string;
  } | null;
  user: {
    name: string;
    email: string;
    whatsapp: string | null;
  } | null;
}

interface SalesDetail extends SalesItem {
  transactions: TransactionItem[];
}

type SortOption = "newest" | "closingDesc" | "closingAsc" | "revenueDesc" | "revenueAsc";

export default function SalesPage() {
  const { theme } = useTheme();
  const { maskPhone } = usePrivacy();
  const [sales, setSales] = useState<SalesItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingSales, setEditingSales] = useState<SalesItem | null>(null);
  const [showDetail, setShowDetail] = useState<SalesDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<"success" | "all">("success");

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    whatsapp: "",
    password: "",
    status: "active",
    category: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastCopied, setToastCopied] = useState(false);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (selectedCategory) params.set("category", selectedCategory);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/sales?${params}`);
      const data = await res.json();
      setSales(data.sales || []);
      if (data.categories) {
        setCategories(data.categories);
      }
    } catch (err) {
      console.error("Failed to fetch sales team:", err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedCategory, startDate, endDate]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  // Show customized Toast notification
  const showToast = (message: string, isCopy = false) => {
    setToastMessage(message);
    setToastCopied(isCopy);
    setTimeout(() => {
      setToastMessage(null);
      setToastCopied(false);
    }, 3000);
  };

  // CRUD actions
  const handleOpenCreate = () => {
    setEditingSales(null);
    setFormData({ name: "", code: "", whatsapp: "", password: "", status: "active", category: "" });
    setShowForm(true);
  };

  const handleOpenEdit = (salesMember: SalesItem) => {
    setEditingSales(salesMember);
    setFormData({
      name: salesMember.name,
      code: salesMember.code,
      whatsapp: salesMember.whatsapp || "",
      password: salesMember.password || "",
      status: salesMember.status,
      category: salesMember.category || ""
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.code) return;
    setSubmitting(true);

    try {
      const url = editingSales ? `/api/sales/${editingSales.id}` : "/api/sales";
      const method = editingSales ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Gagal menyimpan data");
      } else {
        showToast(editingSales ? "Data sales berhasil diperbarui!" : "Sales baru berhasil ditambahkan!");
        setShowForm(false);
        fetchSales();
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan sistem");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus sales "${name}"? Semua history transaksi akan terputus dari sales ini.`)) return;

    try {
      const res = await fetch(`/api/sales/${id}`, {
        method: "DELETE"
      });
      const data = await res.json();

      if (res.ok) {
        showToast("Data sales berhasil dihapus!");
        fetchSales();
      } else {
        alert(data.error || "Gagal menghapus data sales");
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan sistem");
    }
  };

  const handleViewDetail = async (id: string, initialTab: "success" | "all" = "success") => {
    setDetailLoading(true);
    setActiveDetailTab(initialTab);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/sales/${id}?${params}`);
      const data = await res.json();
      if (res.ok) {
        setShowDetail(data.sales);
      } else {
        alert(data.error || "Gagal memuat detail sales");
      }
    } catch (err) {
      console.error(err);
      alert("Koneksi error");
    } finally {
      setDetailLoading(false);
    }
  };

  const copyTrackingLink = (code: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://dorizstore.com";
    const link = `${origin}/?sl=${code}`;
    navigator.clipboard.writeText(link);
    showToast(`Tautan sales berhasil disalin: ${link}`, true);
  };

  // Sorting
  const sortedSales = [...sales].sort((a, b) => {
    if (sortBy === "closingDesc") return b.totalClosing - a.totalClosing;
    if (sortBy === "closingAsc") return a.totalClosing - b.totalClosing;
    if (sortBy === "revenueDesc") return b.totalRevenue - a.totalRevenue;
    if (sortBy === "revenueAsc") return a.totalRevenue - b.totalRevenue;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // newest
  });

  const totalSalesActive = sales.filter((s) => s.status === "active").length;
  const totalClosing = sales.reduce((sum, s) => sum + s.totalClosing, 0);
  const totalRevenue = sales.reduce((sum, s) => sum + s.totalRevenue, 0);

  const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);

  return (
    <div>
      <Topbar title="Tim Sales" subtitle="Kelola sales internal, tautan tracking, dan monitoring performa" />

      <div className="px-8 pb-8 space-y-5">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">
          <div className="glass-card p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-indigo-500/10 text-indigo-400">
              <Users size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{totalSalesActive} / {sales.length}</p>
              <p className="text-xs text-[var(--text-muted)]">Sales Aktif / Total</p>
            </div>
          </div>
          <div className="glass-card p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-500/10 text-emerald-400">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-400">{totalClosing}</p>
              <p className="text-xs text-[var(--text-muted)]">Total Closing (Sukses)</p>
            </div>
          </div>
          <div className="glass-card p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-amber-500/10 text-amber-400">
              <DollarSign size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-400">Rp {fmt(totalRevenue)}</p>
              <p className="text-xs text-[var(--text-muted)]">Total Pendapatan (OMSET)</p>
            </div>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="search-box flex-1 max-w-md">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Cari nama, kode, atau whatsapp..."
                className="form-input !pl-10 h-[42px]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl px-3 py-1.5 min-w-[150px] h-[42px]">
              <select
                className="bg-transparent text-sm text-[var(--text-secondary)] outline-none w-full appearance-none cursor-pointer"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="" className="bg-[var(--bg-card)] text-[var(--text-primary)]">Semua Kategori</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat} className="bg-[var(--bg-card)] text-[var(--text-primary)]">{cat}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl px-3 py-1.5 min-w-[180px] h-[42px]">
              <ArrowUpDown size={14} className="text-[var(--text-muted)]" />
              <select
                className="bg-transparent text-sm text-[var(--text-secondary)] outline-none w-full appearance-none cursor-pointer"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
              >
                <option value="newest" className="bg-[var(--bg-card)] text-[var(--text-primary)]">Terbaru</option>
                <option value="closingDesc" className="bg-[var(--bg-card)] text-[var(--text-primary)]">Closing Terbanyak</option>
                <option value="closingAsc" className="bg-[var(--bg-card)] text-[var(--text-primary)]">Closing Terendah</option>
                <option value="revenueDesc" className="bg-[var(--bg-card)] text-[var(--text-primary)]">Revenue Tertinggi</option>
                <option value="revenueAsc" className="bg-[var(--bg-card)] text-[var(--text-primary)]">Revenue Terendah</option>
              </select>
            </div>

            {/* Date Filters */}
            <div className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl px-3 h-[42px]">
              <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase whitespace-nowrap">Dari</span>
              <input
                type="date"
                className={`bg-transparent text-xs text-[var(--text-secondary)] outline-none cursor-pointer border-0 ${theme === 'dark' ? '[color-scheme:dark]' : '[color-scheme:light]'}`}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl px-3 h-[42px]">
              <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase whitespace-nowrap">Sampai</span>
              <input
                type="date"
                className={`bg-transparent text-xs text-[var(--text-secondary)] outline-none cursor-pointer border-0 ${theme === 'dark' ? '[color-scheme:dark]' : '[color-scheme:light]'}`}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                className="btn-secondary h-[42px] px-3 flex items-center justify-center text-xs text-rose-400 border-rose-950/40 hover:bg-rose-500/10 hover:border-rose-500/20"
                title="Reset Filter Tanggal"
              >
                Reset
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={handleOpenCreate}>
              <Plus size={16} /> Tambah Anggota Sales
            </button>
          </div>
        </div>

        {/* Table List */}
        <div className="glass-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-[var(--accent-primary)]" size={32} />
              <span className="ml-2 text-[var(--text-muted)]">Memuat data tim...</span>
            </div>
          ) : sortedSales.length === 0 ? (
            <div className="text-center py-16">
              <UserPlus size={48} className="mx-auto mb-4 text-[var(--text-muted)]" />
              <p className="text-[var(--text-secondary)]">Tidak ada tim sales ditemukan</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Kategori</th>
                    <th>Kode Tracking</th>
                    <th>WhatsApp</th>
                    <th>Status</th>
                    <th>Password</th>
                    <th>Closing Sukses</th>
                    <th>Semua Closing</th>
                    <th>Total Omset</th>
                    <th className="text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSales.map((s) => (
                    <tr key={s.id}>
                      <td className="font-medium text-[var(--text-primary)]">{s.name}</td>
                      <td>
                        {s.category ? (
                          <span className="badge badge-info">{s.category}</span>
                        ) : (
                          <span className="text-[var(--text-muted)] text-xs">—</span>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-purple font-mono">{s.code}</span>
                      </td>
                      <td className="text-sm font-mono">{s.whatsapp ? maskPhone(s.whatsapp) : "-"}</td>
                      <td>
                        {s.status === "active" ? (
                          <span className="badge badge-success">Aktif</span>
                        ) : (
                          <span className="badge badge-danger">Nonaktif</span>
                        )}
                      </td>
                      <td className="text-xs font-mono text-[var(--text-muted)]">{s.password || "—"}</td>
                      <td>
                        <button
                          onClick={() => handleViewDetail(s.id, "success")}
                          disabled={detailLoading}
                          className={`flex items-center gap-1.5 hover:text-[var(--text-primary)] transition-colors group cursor-pointer text-[var(--accent-primary)]`}
                        >
                          <Briefcase size={14} className="group-hover:text-[var(--text-primary)]" />
                          <span className="font-bold underline">{s.totalClosing} closing</span>
                        </button>
                      </td>
                      <td>
                        <button
                          onClick={() => handleViewDetail(s.id, "all")}
                          disabled={detailLoading}
                          className="flex items-center gap-1.5 hover:text-[var(--text-primary)] text-indigo-400 transition-colors group cursor-pointer"
                        >
                          <Briefcase size={14} className="group-hover:text-[var(--text-primary)]" />
                          <span className="font-bold underline">{s.totalAllClosing} closing</span>
                        </button>
                      </td>
                      <td className="text-emerald-400 font-bold">Rp {fmt(s.totalRevenue)}</td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => copyTrackingLink(s.code)}
                            className="btn-icon hover:bg-[rgba(32,213,210,0.15)] hover:text-[var(--accent-primary)]"
                            title="Salin Link Tracking"
                          >
                            <Link2 size={16} />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(s)}
                            className="btn-icon hover:bg-[rgba(99,102,241,0.15)] hover:text-indigo-400"
                            title="Edit Sales"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id, s.name)}
                            className="btn-icon hover:bg-[rgba(244,63,94,0.15)] hover:text-red-400"
                            title="Hapus Sales"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Detail / Transactions History */}
      {showDetail && (() => {
        const filteredTransactions = showDetail.transactions.filter(
          (t) => activeDetailTab === "all" || t.status === "success"
        );

        return (
          <div className="modal-overlay" onClick={() => setShowDetail(null)}>
            <div className="modal-content" style={{ maxWidth: 768 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                    Detail Performa: {showDetail.name}
                    {showDetail.category && (
                      <span className="badge badge-info text-[10px]">{showDetail.category}</span>
                    )}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">Kode Sales: {showDetail.code} • WA: {showDetail.whatsapp || "-"}</p>
                </div>
                <button className="btn-icon" onClick={() => setShowDetail(null)}><X size={18} /></button>
              </div>

              <div className="modal-body space-y-6">
                {/* Stats Summary & Tabs */}
                <div className="grid grid-cols-3 gap-3">
                  <div 
                    onClick={() => setActiveDetailTab("success")}
                    className={`p-3 rounded-xl text-center cursor-pointer border transition-all ${
                      activeDetailTab === "success" 
                        ? "bg-[rgba(32,213,210,0.1)] border-[rgba(32,213,210,0.3)] text-[var(--accent-primary)]" 
                        : "bg-[var(--bg-secondary)] border-[var(--border-color)] hover:bg-[var(--bg-card-hover)]"
                    }`}
                  >
                    <p className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Closing Sukses</p>
                    <p className="text-lg font-bold text-[var(--text-primary)] mt-1">{showDetail.totalClosing}</p>
                  </div>
                  <div 
                    onClick={() => setActiveDetailTab("all")}
                    className={`p-3 rounded-xl text-center cursor-pointer border transition-all ${
                      activeDetailTab === "all" 
                        ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400" 
                        : "bg-[var(--bg-secondary)] border-[var(--border-color)] hover:bg-[var(--bg-card-hover)]"
                    }`}
                  >
                    <p className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Semua Closing</p>
                    <p className="text-lg font-bold text-[var(--text-primary)] mt-1">{showDetail.totalAllClosing}</p>
                  </div>
                  <div className="p-3 rounded-xl text-center bg-amber-500/5 border border-amber-500/10">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Total Omset</p>
                    <p className="text-lg font-bold text-amber-400 mt-1">Rp {fmt(showDetail.totalRevenue)}</p>
                  </div>
                </div>

                {/* Transactions List */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                      {activeDetailTab === "success" ? "Riwayat Closing Sukses" : "Semua Riwayat Closing"} ({filteredTransactions.length})
                    </p>
                    <div className="flex gap-1">
                      <button 
                        type="button"
                        onClick={() => setActiveDetailTab("success")}
                        className={`text-[10px] px-2.5 py-1 rounded-md transition-all ${
                          activeDetailTab === "success" ? "bg-[rgba(32,213,210,0.15)] text-[var(--accent-primary)] font-bold" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        Sukses
                      </button>
                      <button 
                        type="button"
                        onClick={() => setActiveDetailTab("all")}
                        className={`text-[10px] px-2.5 py-1 rounded-md transition-all ${
                          activeDetailTab === "all" ? "bg-indigo-500/15 text-indigo-400 font-bold" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        Semua
                      </button>
                    </div>
                  </div>

                  {filteredTransactions.length > 0 ? (
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
                      {filteredTransactions.map((t) => (
                        <div
                          key={t.id}
                          className="p-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] space-y-3"
                        >
                          <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                            <span className="text-sm font-bold text-[var(--text-primary)]">{t.productName || "CapCut Pro (Default)"}</span>
                            <span className={`badge ${
                              t.status === 'success' ? 'badge-success' : t.status === 'pending' ? 'badge-warning' : 'badge-danger'
                            }`}>
                              {t.status === 'success' ? 'Sukses' : t.status === 'pending' ? 'Pending' : 'Gagal'}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5 text-xs text-[var(--text-secondary)]">
                            <div>
                              <span className="text-[var(--text-muted)]">Nama Pembeli:</span> <span className="text-[var(--text-primary)] font-medium">{t.user?.name || "—"}</span>
                            </div>
                            <div>
                              <span className="text-[var(--text-muted)]">Nomor WhatsApp:</span> <span className="text-[var(--text-primary)] font-mono font-medium">{t.user?.whatsapp || "—"}</span>
                            </div>
                            <div>
                              <span className="text-[var(--text-muted)]">Alamat Email:</span> <span className="text-[var(--text-primary)] font-mono font-medium">{t.user?.email || "—"}</span>
                            </div>
                            <div>
                              <span className="text-[var(--text-muted)]">Nominal Tagihan:</span> <span className="text-[var(--text-primary)] font-bold">Rp {fmt(Number(t.amount))}</span>
                            </div>
                            <div>
                              <span className="text-[var(--text-muted)]">Tanggal Transaksi:</span> <span className="text-[var(--text-primary)] font-medium">{t.purchaseDate ? new Date(t.purchaseDate).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}</span>
                            </div>
                            {t.voucherCode && (
                              <div>
                                <span className="text-[var(--text-muted)]">Voucher Terpakai:</span> <span className="badge badge-purple text-[9px]">{t.voucherCode}</span>
                              </div>
                            )}
                            {t.stockAccount && (
                              <div className="col-span-1 md:col-span-2 mt-1 p-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-color)] font-mono text-[11px] text-indigo-600 dark:text-[#c7d2fe]">
                                <span className="text-[var(--text-muted)]">Akun CapCut Terkirim:</span> {t.stockAccount.accountEmail}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center p-8 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                      <p className="text-sm text-[var(--text-muted)]">Belum ada transaksi yang tercatat.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setShowDetail(null)}>Tutup</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Tambah/Edit Sales */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-lg font-bold text-[var(--text-primary)]">
                {editingSales ? "Edit Anggota Sales" : "Tambah Anggota Sales"}
              </h3>
              <button className="btn-icon" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-body space-y-4">
                <div>
                  <label className="form-label">Nama Lengkap *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="Nama anggota sales"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Kode Sales * (untuk link tracking)</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="Contoh: rido123"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  />
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">
                    Link tracking akan bertipe: dorizstore.com/?sl=<b>kode-sales</b>
                  </p>
                </div>
                <div>
                  <label className="form-label">WhatsApp</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Contoh: 081234567890"
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Password Login (untuk Dashboard Sales)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Password akses untuk dashboard sales"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">
                    Digunakan sales untuk login ke dashboard performa mereka di masa mendatang.
                  </p>
                </div>
                <div>
                  <label className="form-label">Kategori (contoh: endorse, organic)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Contoh: endorse, organic, dll"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  />
                </div>
                {editingSales && (
                  <div>
                    <label className="form-label">Status</label>
                    <select
                      className="form-input cursor-pointer"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="active">Aktif</option>
                      <option value="inactive">Nonaktif</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary gap-2 disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                  {submitting ? "Menyimpan..." : "Simpan Data"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Copy Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-[slideUp_0.3s_ease]">
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg"
            style={{
              background: "rgba(32, 213, 210, 0.15)",
              border: "1px solid rgba(32, 213, 210, 0.3)",
              backdropFilter: "blur(12px)",
            }}
          >
            {toastCopied ? <Check size={16} className="text-[var(--accent-primary)]" /> : <Copy size={16} className="text-[var(--accent-primary)]" />}
            <span className="text-sm text-cyan-300">{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
