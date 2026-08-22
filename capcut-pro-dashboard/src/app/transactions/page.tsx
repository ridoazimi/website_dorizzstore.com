"use client";

import { useState, useEffect, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePrivacy } from "@/context/PrivacyContext";
import {
  Plus,
  Search,
  X,
  Check,
  Loader2,
  Send,
  CalendarDays,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  Copy,
  LayoutList,
  LayoutGrid,
  Minimize2,
  Maximize2,
  Clock,
  Files,
  Smartphone,
  Monitor,
  ChevronDown,
  Filter,
  Shield,
  SlidersHorizontal,
  Users,
  MessageCircle,
  ExternalLink,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface Transaction {
  id: string;
  lynkIdRef: string | null;
  receiptNumber: string | null;
  amount: number;
  productName: string | null;
  status: string | null;
  source: string | null;
  purchaseDate: string | null;
  warrantyExpiredAt: string | null;
  createdAt: string | null;
  user: { id: string; name: string; email: string; whatsapp: string | null } | null;
  stockAccount: { id: string; accountEmail: string; status: string | null } | null;
  voucherCode: string | null;
  sales: { id: string; name: string; code: string } | null;
}

const statusFilters = ["Semua", "success", "pending", "failed"];
const statusLabels: Record<string, string> = { Semua: "Semua", success: "Sukses", pending: "Pending", failed: "Gagal" };

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("id-ID", { 
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function getStatusBadge(status: string | null) {
  switch (status) {
    case "success": return <span className="badge badge-success">Sukses</span>;
    case "pending": return <span className="badge badge-warning">Pending</span>;
    case "failed": return <span className="badge badge-danger">Gagal</span>;
    default: return <span className="badge badge-neutral">{status || "-"}</span>;
  }
}

function getActiveBadge(expiredAt: string | null) {
  if (!expiredAt) return <span className="text-[var(--text-muted)] text-xs">-</span>;
  const now = new Date();
  const exp = new Date(expiredAt);
  const isActive = exp > now;
  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80" }}>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Aktif{daysLeft <= 7 ? ` (${daysLeft}h)` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}>
      Expired
    </span>
  );
}

const sourceFilters = ["Semua", "lynkid", "manual", "website", "shopee"];
const sourceLabels: Record<string, string> = { Semua: "Semua Sumber", lynkid: "Lynk.id", manual: "Manual", website: "Website", shopee: "Shopee" };

function getSourceBadge(source: string | null) {
  if (!source) return <span className="badge badge-info">Lynk.id</span>;
  const s = source.toLowerCase().replace('.', '');
  switch (s) {
    case "manual": return <span className="badge badge-purple">Manual</span>;
    case "website": return <span className="badge badge-warning">Website</span>;
    case "lynkid": return <span className="badge badge-info">Lynk.id</span>;
    case "shopee": return <span className="badge" style={{ background: "rgba(238, 77, 45, 0.15)", color: "#EE4D2D", border: "1px solid rgba(238, 77, 45, 0.3)" }}>Shopee</span>;
    default: return <span className="badge badge-info">{source}</span>;
  }
}

export default function TransactionsPage() {
  const { maskEmail, maskPhone } = usePrivacy();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [statusFilter, setStatusFilter] = useState("Semua");
  const [sourceFilter, setSourceFilter] = useState("Semua");
  // Filter tanggal transaksi
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // Filter garansi berakhir
  const [warrantyStartDate, setWarrantyStartDate] = useState("");
  const [warrantyEndDate, setWarrantyEndDate] = useState("");
  // UI state filter panel
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateFilterTab, setDateFilterTab] = useState<'purchase' | 'warranty'>('purchase');
  const [showUserModal, setShowUserModal] = useState(false);
  // Follow-up export form state (step 2 inside user modal)
  const [exportStep, setExportStep] = useState<1 | 2>(1);
  const [exportTitle, setExportTitle] = useState("");
  const [exportTemplate, setExportTemplate] = useState("Halo {{nama_customer}}, kami dari Dorizz Store 😊\nMasa aktif akun CapCut Pro kamu sudah berakhir. Yuk perpanjang lagi agar tetap bisa menikmati fitur premium!\n\nInfo lebih lanjut bisa langsung chat ya 🙏");
  const [exportDate, setExportDate] = useState("");
  const [exportSubmitting, setExportSubmitting] = useState(false);
  const [exportResult, setExportResult] = useState<{ ok: boolean; message: string } | null>(null);
  // Templates from settings
  const [settingsTemplates, setSettingsTemplates] = useState<Record<string, string>>({});
  // Selected WA template for popup
  const [selectedWATemplate, setSelectedWATemplate] = useState<string>("template_wa_expired");
  const [customWAMessage, setCustomWAMessage] = useState<string>("");
  const [showTemplateSettings, setShowTemplateSettings] = useState(false);
  
  const [products, setProducts] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; userId?: string; transactionId?: string; message?: string } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", whatsapp: "", amount: "", productName: "", productId: "", source: "Manual", activeDate: new Date().toISOString().split('T')[0], durationDays: 30 });

  // State untuk kirim akun setelah transaksi berhasil
  const [accountType, setAccountType] = useState<'mobile' | 'desktop'>('mobile');
  const [sendingAccount, setSendingAccount] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: boolean; accountEmail?: string; message?: string } | null>(null);

  const WEBHOOK_URL = "https://appsheetindonesia-dorrizstore.qxifii.easypanel.host/webhook/871951d3-775f-4891-906c-c9c372f7aa88";

  // Pagination
  const [page, setPage] = useState(1);
  const limit = 50;
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedTrxForStatus, setSelectedTrxForStatus] = useState<Transaction | null>(null);
  const [newStatusSelection, setNewStatusSelection] = useState<string>("success");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  function openStatusModal(trx: Transaction) {
    setSelectedTrxForStatus(trx);
    setNewStatusSelection(trx.status || "success");
    setShowStatusModal(true);
  }

  async function handleUpdateStatus() {
    if (!selectedTrxForStatus) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/transactions/${selectedTrxForStatus.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatusSelection }),
      });
      const json = await res.json();
      if (res.ok) {
        alert(json.message || "Status transaksi berhasil diperbarui!");
        setShowStatusModal(false);
        setSelectedTrxForStatus(null);
        fetchData(page, false);
      } else {
        alert(json.error || "Gagal memperbarui status transaksi");
      }
    } catch {
      alert("Koneksi error");
    } finally {
      setUpdatingStatus(false);
    }
  }

  function copyUUID(id: string) {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  // Import state
  interface FileJob {
    file: File;
    status: 'waiting' | 'importing' | 'done' | 'error';
    created: number;
    skipped: number;            // duplikat
    skippedNonSuccess: number;  // PENDING/FAILED dari Lynk.id
    errors: string[];
    rows: number;
  }
  interface ImportProgress {
    fileIndex: number;      // file ke berapa (0-based)
    totalFiles: number;
    currentBatch: number;
    totalBatches: number;
    currentRows: number;
    totalRows: number;
  }

  const [showImportModal, setShowImportModal] = useState(false);
  const [importMinimized, setImportMinimized] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFiles, setImportFiles] = useState<FileJob[]>([]);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importDone, setImportDone] = useState(false);

  const fetchData = useCallback((pageNum: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter !== "Semua") params.set("status", statusFilter);
    if (sourceFilter !== "Semua") params.set("source", sourceFilter);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (warrantyStartDate) params.set("warrantyStart", warrantyStartDate);
    if (warrantyEndDate) params.set("warrantyEnd", warrantyEndDate);
    params.set("page", String(pageNum));
    params.set("limit", String(limit));

    fetch(`/api/transactions?${params}`)
      .then((res) => res.json())
      .then((json) => {
        const newItems: Transaction[] = json.transactions || [];
        if (append) {
          setTransactions(prev => [...prev, ...newItems]);
        } else {
          setTransactions(newItems);
        }
        setTotal(json.total || 0);
        setHasMore(newItems.length >= limit);
      })
      .catch(console.error)
      .finally(() => {
        if (append) setLoadingMore(false);
        else setLoading(false);
      });
  }, [debouncedSearch, statusFilter, sourceFilter, startDate, endDate, warrantyStartDate, warrantyEndDate]);

  // Fresh load saat filter berubah
  useEffect(() => {
    setPage(1);
    setHasMore(true);
    fetchData(1, false);
  }, [fetchData]);

  // Fetch template settings on mount
  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(d => {
      setSettingsTemplates(d || {});
    }).catch(() => {});
    
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

  async function handleConfirmPending(trxId: string) {
    if (!confirm("Konfirmasi transaksi ini secara manual? Transaksi akan ditandai sukses, mengambil stok, dan mengirim data akun ke pelanggan.")) return;
    setActionLoading(trxId);
    try {
      const res = await fetch(`/api/transactions/${trxId}/confirm`, {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok) {
        alert(json.message || "Transaksi berhasil dikonfirmasi!");
        fetchData(page, false);
      } else {
        alert(json.error || "Gagal mengonfirmasi transaksi");
      }
    } catch (err) {
      alert("Koneksi error");
    } finally {
      setActionLoading(null);
    }
  }


  async function handleAddManual() {
    if (!form.name || !form.email || !form.whatsapp) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setResult({ message: "Email tidak valid (harus mengandung @ dan format yang benar)." });
      return;
    }

    setSubmitting(true);
    setResult(null);
    setSendResult(null);
    try {
      // Append current local time to the selected date for purchaseDate (TANGGAL BELI)
      const now = new Date();
      // Parse the date string as local time by splitting and creating Date with components
      const [year, month, day] = form.activeDate.split('-').map(Number);
      const selectedDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      const purchaseDate = selectedDate.toISOString();

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: form.name, 
          email: form.email, 
          whatsapp: form.whatsapp, 
          amount: parseFloat(form.amount) || 0, 
          productName: form.productName || "CapCut Pro", 
          source: form.source, 
          purchaseDate: purchaseDate,
          durationDays: form.durationDays || 30
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setResult({
          success: true,
          userId: json.userId || json.transaction?.userId,
          transactionId: json.transaction?.id,
          message: json.message || "Data transaksi berhasil ditambahkan, kirim data akun ke pelanggan?"
        });
        fetchData(1, false);
      } else {
        setResult({ message: json.error || "Gagal membuat transaksi" });
      }
    } catch { setResult({ message: "Koneksi error" }); }
    setSubmitting(false);
  }

  async function handleSendAccount() {
    setSendingAccount(true);
    setSendResult(null);
    try {
      // 1. Ambil stok akun tersedia sesuai tipe + template dari settings (parallel)
      const [stockRes, settingsRes] = await Promise.all([
        fetch(`/api/stock?status=available&productType=${accountType}&usageType=sale&limit=1`),
        fetch("/api/settings"),
      ]);
      const stockJson = await stockRes.json();
      const settingsJson = await settingsRes.json();
      const account = stockJson.accounts?.[0];

      if (!account) {
        setSendResult({ sent: false, message: `Tidak ada stok ${accountType === 'mobile' ? 'Mobile' : 'Desktop'} yang tersedia` });
        setSendingAccount(false);
        return;
      }

      // 2. Render template pesan dengan variabel dinamis
      const templateRaw: string = settingsJson.template_send_account || "";
      const tipeLabel = accountType === 'mobile' ? 'Mobile (HP/iPad)' : 'Desktop (PC/Mac)';
      const renderedMessage = templateRaw
        .replaceAll("{{nama}}", form.name)
        .replaceAll("{{email}}", form.email)
        .replaceAll("{{akun_email}}", account.accountEmail)
        .replaceAll("{{akun_password}}", account.accountPassword)
        .replaceAll("{{tipe}}", tipeLabel)
        .replaceAll("{{durasi}}", String(account.durationDays || 30));

      // 3. Kirim ke webhook dengan template message
      const whatsapp = form.whatsapp.replace(/^0/, "62").replace(/\D/g, "");
      await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: whatsapp,
          accountEmail: account.accountEmail,
          accountPassword: account.accountPassword,
          productType: accountType,
          durationDays: account.durationDays || 30,
          message: renderedMessage, // template yang sudah di-render
        }),
      });

      // 4. Update usedSlots di stok (tandai slot terpakai) & hubungkan ke transaksi
      await fetch(`/api/stock/${account.id}/use`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: result?.userId,
          transactionId: result?.transactionId
        }),
      });

      setSendResult({ sent: true, accountEmail: account.accountEmail, message: "Akun berhasil dikirim via webhook!" });
      fetchData(1, false);
    } catch (err) {
      setSendResult({ sent: false, message: `Gagal mengirim: ${err instanceof Error ? err.message : String(err)}` });
    }
    setSendingAccount(false);
  }


  function closeModal() {
    setShowModal(false);
    setForm({ name: "", email: "", whatsapp: "", amount: "", productName: "", productId: "", source: "Manual", activeDate: new Date().toISOString().split('T')[0], durationDays: 30 });
    setResult(null);
    setSendResult(null);
  }

  function openImportModal() {
    setShowImportModal(true);
    setImportMinimized(false);
  }

  function closeImportModal() {
    if (importing) return; // jangan tutup saat proses berlangsung
    setShowImportModal(false);
    setImportMinimized(false);
    setImportFiles([]);
    setImportProgress(null);
    setImportDone(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    // Sort: terbaru → terlama berdasarkan lastModified
    const sorted = selected.sort((a, b) => b.lastModified - a.lastModified);
    setImportFiles(sorted.map(f => ({ file: f, status: 'waiting', created: 0, skipped: 0, skippedNonSuccess: 0, errors: [], rows: 0 })));
    setImportDone(false);
    setImportProgress(null);
  }

  /** RFC-4180 CSV parser — handles quoted fields with commas/newlines */
  function parseCSV(text: string): Record<string, string>[] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    let i = 0;
    // Normalize line endings
    const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    while (i < s.length) {
      const ch = s[i];
      if (inQuotes) {
        if (ch === '"') {
          if (s[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { row.push(field); field = ""; i++; continue; }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += ch; i++;
    }
    // Last field & row
    row.push(field);
    if (row.some(f => f !== "")) rows.push(row);

    if (rows.length < 2) return [];
    const headers = rows[0].map(h => h.trim());
    return rows.slice(1).map(vals => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = (vals[idx] ?? "").trim(); });
      return obj;
    });
  }

  async function parseFileToRows(file: File): Promise<Record<string, unknown>[]> {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith(".json")) {
      const text = await file.text();
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : (parsed.transactions || parsed.data || []);
    } else if (fileName.endsWith(".csv")) {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) throw new Error("File CSV kosong atau hanya header.");
      return rows;
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const XLSX = await import("xlsx");
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("File Excel kosong.");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName]);
      if (rows.length === 0) throw new Error("Sheet pertama kosong.");
      return rows;
    }
    throw new Error("Format tidak didukung. Gunakan .json, .csv, atau .xlsx");
  }

  async function handleImport() {
    if (importFiles.length === 0) return;
    setImporting(true);
    setImportDone(false);

    const BATCH_SIZE = 50;
    const jobs = [...importFiles];

    for (let fi = 0; fi < jobs.length; fi++) {
      // Update status file ini jadi 'importing'
      setImportFiles(prev => prev.map((j, idx) => idx === fi ? { ...j, status: 'importing' } : j));

      let transactions: Record<string, unknown>[] = [];
      try {
        transactions = await parseFileToRows(jobs[fi].file);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setImportFiles(prev => prev.map((j, idx) => idx === fi ? { ...j, status: 'error', errors: [msg] } : j));
        continue;
      }

      const totalBatches = Math.ceil(transactions.length / BATCH_SIZE);
      let filCreated = 0, filSkipped = 0, filSkippedNonSuccess = 0;
      const filErrors: string[] = [];

      for (let b = 0; b < totalBatches; b++) {
        setImportProgress({
          fileIndex: fi,
          totalFiles: jobs.length,
          currentBatch: b + 1,
          totalBatches,
          currentRows: b * BATCH_SIZE,
          totalRows: transactions.length,
        });

        const batch = transactions.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
        try {
          const res = await fetch("/api/transactions/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transactions: batch }),
          });
          const rawText = await res.text();
          let json: Record<string, unknown>;
          try { json = JSON.parse(rawText); }
          catch { filErrors.push(`Batch ${b + 1}: Server error — ${rawText.substring(0, 100)}`); continue; }

          if (res.ok && json.summary) {
            const s = json.summary as { created: number; skipped: number; skippedNonSuccess: number; errors: string[] };
            filCreated += s.created || 0;
            filSkipped += s.skipped || 0;
            filSkippedNonSuccess += s.skippedNonSuccess || 0;
            if (s.errors?.length) filErrors.push(...s.errors);
          } else {
            filErrors.push(`Batch ${b + 1}: ${(json.error as string) || 'Server error'}`);
          }
        } catch (err) {
          filErrors.push(`Batch ${b + 1}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Final progress untuk file ini
      setImportProgress({
        fileIndex: fi,
        totalFiles: jobs.length,
        currentBatch: totalBatches,
        totalBatches,
        currentRows: transactions.length,
        totalRows: transactions.length,
      });

      setImportFiles(prev => prev.map((j, idx) =>
        idx === fi ? { ...j, status: filErrors.length > 0 && filCreated === 0 ? 'error' : 'done', created: filCreated, skipped: filSkipped, skippedNonSuccess: filSkippedNonSuccess, errors: filErrors.slice(0, 10), rows: transactions.length } : j
      ));
    }

    fetchData(1, false);
    setImporting(false);
    setImportDone(true);
    setImportMinimized(false);
    setShowImportModal(true);
  }

  return (
    <>
      <Topbar title="Transaksi" subtitle="Kelola transaksi penjualan CapCut Pro" />

      <div className="px-4 md:px-8 pb-8 space-y-5">
        {/* ── Toolbar ── */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex flex-col gap-3 flex-1 min-w-0">
            {/* Row 1: Search + Filter button */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="search-box flex-1 min-w-[160px] max-w-xs">
                <Search size={16} className="search-icon" />
                <input type="text" placeholder="Cari nama, email, ID, no. pemesanan..." className="form-input !pl-10 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {/* Filter tanggal button dengan indikator aktif */}
              <button
                onClick={() => setShowDateFilter(v => !v)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all flex-shrink-0"
                style={{
                  background: showDateFilter || startDate || endDate || warrantyStartDate || warrantyEndDate
                    ? "rgba(129,140,248,0.15)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${
                    startDate || endDate || warrantyStartDate || warrantyEndDate
                      ? "rgba(129,140,248,0.5)" : "rgba(255,255,255,0.1)"
                  }`,
                  color: startDate || endDate || warrantyStartDate || warrantyEndDate ? "#818cf8" : "var(--text-muted)",
                }}
              >
                <SlidersHorizontal size={14} />
                Filter Tanggal
                {(startDate || endDate || warrantyStartDate || warrantyEndDate) && (
                  <span
                    className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(129,140,248,0.25)", color: "#818cf8" }}
                  >
                    {[startDate || endDate ? 1 : 0, warrantyStartDate || warrantyEndDate ? 1 : 0].reduce((a, b) => a + b, 0)} aktif
                  </span>
                )}
              </button>
            </div>

            {/* Panel filter tanggal (collapsible) */}
            {showDateFilter && (
              <div
                className="rounded-2xl p-4 space-y-4"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(129,140,248,0.15)" }}
              >
                {/* Tab switcher */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setDateFilterTab('purchase')}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: dateFilterTab === 'purchase' ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${dateFilterTab === 'purchase' ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.08)"}`,
                      color: dateFilterTab === 'purchase' ? "#818cf8" : "var(--text-muted)",
                    }}
                  >
                    <CalendarDays size={12} /> Tanggal Transaksi
                    {(startDate || endDate) && <span className="w-1.5 h-1.5 rounded-full bg-[#818cf8] flex-shrink-0" />}
                  </button>
                  <button
                    onClick={() => setDateFilterTab('warranty')}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: dateFilterTab === 'warranty' ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${dateFilterTab === 'warranty' ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.08)"}`,
                      color: dateFilterTab === 'warranty' ? "#f87171" : "var(--text-muted)",
                    }}
                  >
                    <Shield size={12} /> Masa Aktif Berakhir
                    {(warrantyStartDate || warrantyEndDate) && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />}
                  </button>
                </div>

                {dateFilterTab === 'purchase' && (
                  <div className="space-y-3">
                    <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                      <CalendarDays size={11} /> Filter berdasarkan tanggal pembelian / transaksi
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="form-label">Dari Tanggal</label>
                        <input
                          type="date"
                          className="form-input"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">Sampai Tanggal</label>
                        <input
                          type="date"
                          className="form-input"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                    {(startDate || endDate) && (
                      <button
                        onClick={() => { setStartDate(""); setEndDate(""); }}
                        className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition-colors"
                      >
                        <X size={11} /> Reset filter transaksi
                      </button>
                    )}
                  </div>
                )}

                {dateFilterTab === 'warranty' && (
                  <div className="space-y-3">
                    <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                      <Shield size={11} /> Filter berdasarkan tanggal masa aktif akun berakhir
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="form-label">Garansi Dari</label>
                        <input
                          type="date"
                          className="form-input"
                          value={warrantyStartDate}
                          onChange={(e) => setWarrantyStartDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">Garansi Sampai</label>
                        <input
                          type="date"
                          className="form-input"
                          value={warrantyEndDate}
                          onChange={(e) => setWarrantyEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                    {/* Shortcut cepat */}
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "Habis hari ini", fn: () => { const d = new Date().toISOString().slice(0, 10); setWarrantyStartDate(d); setWarrantyEndDate(d); } },
                        { label: "7 hari ke depan", fn: () => { const s = new Date().toISOString().slice(0, 10); const e = new Date(Date.now() + 7*86400000).toISOString().slice(0, 10); setWarrantyStartDate(s); setWarrantyEndDate(e); } },
                        { label: "30 hari ke depan", fn: () => { const s = new Date().toISOString().slice(0, 10); const e = new Date(Date.now() + 30*86400000).toISOString().slice(0, 10); setWarrantyStartDate(s); setWarrantyEndDate(e); } },
                        { label: "Sudah expired", fn: () => { setWarrantyStartDate(""); setWarrantyEndDate(new Date().toISOString().slice(0, 10)); } },
                      ].map((sh) => (
                        <button
                          key={sh.label}
                          onClick={sh.fn}
                          className="text-[11px] px-2.5 py-1 rounded-lg transition-colors"
                          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
                        >
                          {sh.label}
                        </button>
                      ))}
                    </div>
                    {(warrantyStartDate || warrantyEndDate) && (
                      <button
                        onClick={() => { setWarrantyStartDate(""); setWarrantyEndDate(""); }}
                        className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition-colors"
                      >
                        <X size={11} /> Reset filter
                      </button>
                    )}
                    {/* Tombol Cek User — hanya muncul jika filter aktif & ada data */}
                    {(warrantyStartDate || warrantyEndDate) && transactions.length > 0 && (
                      <button
                        onClick={() => setShowUserModal(true)}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all mt-1"
                        style={{
                          background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))",
                          border: "1px solid rgba(129,140,248,0.3)",
                          color: "#a5b4fc",
                        }}
                      >
                        <Users size={14} />
                        Cek User ({(() => {
                          const uniqueUsers = new Map<string, boolean>();
                          transactions.forEach(t => { if (t.user?.id) uniqueUsers.set(t.user.id, true); });
                          return uniqueUsers.size;
                        })()} pelanggan)
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Row 2: Status + Source filter pills */}
            <div className="flex flex-wrap gap-3">
              <div className="filter-pills-scroll">
                <div className="filter-pills flex-nowrap">
                  {sourceFilters.map((f) => (
                    <button key={f} className={`filter-pill flex-shrink-0 ${sourceFilter === f ? "active" : ""}`} onClick={() => setSourceFilter(f)}>{sourceLabels[f]}</button>
                  ))}
                </div>
              </div>
              <div className="filter-pills-scroll">
                <div className="filter-pills flex-nowrap">
                  {statusFilters.map((f) => (
                    <button key={f} className={`filter-pill flex-shrink-0 ${statusFilter === f ? "active" : ""}`} onClick={() => setStatusFilter(f)}>{statusLabels[f]}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button className="btn-secondary flex items-center gap-1.5" onClick={openImportModal}><Upload size={16} /> Import Lynk.id</button>
            <button className="btn-primary flex-shrink-0" onClick={() => setShowModal(true)}><Plus size={16} /> Tambah Manual</button>
          </div>
        </div>

        {/* ── View Toggle (mobile only) ── */}
        <div className="flex items-center justify-between lg:hidden">
          <p className="text-xs text-[var(--text-muted)]">Total {total} transaksi</p>
          <div className="flex gap-1">
            <button className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>
              <LayoutList size={13} /> Tabel
            </button>
            <button className={`view-toggle-btn ${viewMode === 'card' ? 'active' : ''}`} onClick={() => setViewMode('card')}>
              <LayoutGrid size={13} /> Card
            </button>
          </div>
        </div>

        <div className="glass-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-[#818cf8]" /><span className="ml-2 text-[var(--text-secondary)]">Memuat...</span></div>
          ) : (
            <>
              {/* ── Table View ── */}
              {viewMode === 'table' && (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>UUID (Transaksi)</th>
                        <th>Lynk.id Ref</th>
                        <th>No. Pemesanan</th>
                        <th>Pelanggan</th>
                        <th>WhatsApp</th>
                        <th>Akun CapCut</th>
                        <th>Produk</th>
                        <th>Voucher</th>
                        <th>Nominal</th>
                        <th>Tanggal Beli</th>
                        <th>Aktif Sampai</th>
                        <th>Dibuat</th>
                        <th>Sumber</th>
                        <th>Sales</th>
                        <th className="sticky-col-head">Status</th>
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.length === 0 ? (
                        <tr><td colSpan={16} className="text-center py-8 text-[var(--text-muted)]">Belum ada transaksi</td></tr>
                      ) : (
                        transactions.map((trx) => (
                          <tr key={trx.id}>
                            <td className="font-mono text-xs text-[#818cf8]">
                              <div className="flex items-center gap-1.5">
                                <span title={trx.id}>{trx.id.substring(0, 8)}...</span>
                                <button onClick={() => copyUUID(trx.id)} title="Copy UUID" className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                                  {copiedId === trx.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                </button>
                              </div>
                            </td>
                            <td className="font-mono text-xs text-[var(--text-muted)]">{trx.lynkIdRef || <span className="opacity-40">-</span>}</td>
                            <td className="font-mono text-xs text-[var(--text-muted)]">{trx.receiptNumber || <span className="opacity-40">-</span>}</td>
                            <td>
                              <p className="font-medium">{trx.user?.name || "-"}</p>
                              <p className="text-xs text-[var(--text-muted)]">{maskEmail(trx.user?.email)}</p>
                            </td>
                            <td className="text-sm text-[var(--text-secondary)]">{maskPhone(trx.user?.whatsapp)}</td>
                            <td className="font-mono text-xs">{trx.stockAccount?.accountEmail || "-"}</td>
                            <td className="text-sm font-medium text-[#c7d2fe]">{trx.productName || <span className="text-[var(--text-muted)] italic text-xs">CapCut Pro (Default)</span>}</td>
                            <td className="font-mono text-xs">
                              {trx.voucherCode ? (
                                <span className="badge badge-purple">{trx.voucherCode}</span>
                              ) : (
                                <span className="text-[var(--text-muted)]">-</span>
                              )}
                            </td>
                            <td className="font-semibold">{formatCurrency(Number(trx.amount))}</td>
                            <td className="text-[var(--text-secondary)] text-sm">{formatDateTime(trx.purchaseDate)}</td>
                            <td className="text-sm">
                              <div className="flex flex-col gap-0.5">
                                <span>{formatDate(trx.warrantyExpiredAt)}</span>
                                {getActiveBadge(trx.warrantyExpiredAt)}
                              </div>
                            </td>
                            <td className="text-xs text-[var(--text-muted)]">{formatDateTime(trx.createdAt ?? null)}</td>
                            <td>{getSourceBadge(trx.source)}</td>
                            <td>
                              {trx.sales ? (
                                <span className="badge badge-primary" title={trx.sales.name}>{trx.sales.code}</span>
                              ) : (
                                <span className="text-[var(--text-muted)]">-</span>
                              )}
                            </td>
                            <td className="sticky-col-body">{getStatusBadge(trx.status)}</td>
                            <td>
                              {trx.status === "pending" && (
                                <button
                                  onClick={() => handleConfirmPending(trx.id)}
                                  disabled={actionLoading === trx.id}
                                  className="inline-flex items-center justify-center gap-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all duration-200 disabled:opacity-50"
                                >
                                  {actionLoading === trx.id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />}
                                  Confirm
                                </button>
                              )}
                              {trx.status === "success" && (
                                <button
                                  onClick={() => openStatusModal(trx)}
                                  className="inline-flex items-center justify-center gap-1 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white border border-indigo-500/20 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all duration-200"
                                >
                                  Ubah Status
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Card View (mobile) ── */}
              {viewMode === 'card' && (
                <div className="data-card-grid">
                  {transactions.length === 0 ? (
                    <p className="text-center py-8 text-[var(--text-muted)]">Belum ada transaksi</p>
                  ) : (
                    transactions.map((trx) => (
                      <div key={trx.id} className="data-card">
                        <div className="flex items-start justify-between mb-3">
                          <div className="min-w-0 flex-1 mr-2">
                            <p className="font-semibold text-[var(--text-primary)] text-sm truncate">{trx.user?.name || "-"}</p>
                            <p className="text-xs text-[var(--text-muted)] truncate">{maskEmail(trx.user?.email)}</p>
                          </div>
                          {getStatusBadge(trx.status)}
                        </div>
                        <div className="space-y-1.5 pt-2.5 border-t border-[rgba(99,102,241,0.08)]">
                          <div className="data-card-row">
                            <span className="data-card-label">Nominal</span>
                            <span className="data-card-value font-semibold text-[var(--text-primary)]">{formatCurrency(Number(trx.amount))}</span>
                          </div>
                          <div className="data-card-row">
                            <span className="data-card-label">No. Pemesanan</span>
                            <span className="data-card-value font-mono text-xs">{trx.receiptNumber || "-"}</span>
                          </div>
                          <div className="data-card-row">
                            <span className="data-card-label">Produk</span>
                            <span className="data-card-value text-[#c7d2fe]">{trx.productName || "CapCut Pro"}</span>
                          </div>
                          <div className="data-card-row">
                            <span className="data-card-label">Voucher</span>
                            <span className="data-card-value font-mono text-xs">
                              {trx.voucherCode ? (
                                <span className="badge badge-purple text-[10px]">{trx.voucherCode}</span>
                              ) : (
                                "-"
                              )}
                            </span>
                          </div>
                          <div className="data-card-row">
                            <span className="data-card-label">Akun</span>
                            <span className="data-card-value font-mono text-xs">{trx.stockAccount?.accountEmail || "-"}</span>
                          </div>
                          <div className="data-card-row">
                            <span className="data-card-label">Tanggal Beli</span>
                            <span className="data-card-value">{formatDate(trx.purchaseDate)}</span>
                          </div>
                          <div className="data-card-row">
                            <span className="data-card-label">Aktif Sampai</span>
                            <span className="data-card-value flex items-center gap-1.5">
                              {formatDate(trx.warrantyExpiredAt)}
                              {getActiveBadge(trx.warrantyExpiredAt)}
                            </span>
                          </div>
                          <div className="data-card-row">
                            <span className="data-card-label">Sumber</span>
                            <span className="data-card-value">{getSourceBadge(trx.source)}</span>
                          </div>
                          <div className="data-card-row">
                            <span className="data-card-label">Sales</span>
                            <span className="data-card-value">
                              {trx.sales ? (
                                <span className="badge badge-primary text-[10px]" title={trx.sales.name}>{trx.sales.code}</span>
                              ) : (
                                "-"
                              )}
                            </span>
                          </div>
                          <div className="data-card-row">
                            <span className="data-card-label">WA</span>
                            <span className="data-card-value">{maskPhone(trx.user?.whatsapp)}</span>
                          </div>
                        </div>
                        {trx.status === "pending" && (
                          <div className="mt-3 pt-3 border-t border-[rgba(99,102,241,0.08)]">
                            <button
                              onClick={() => handleConfirmPending(trx.id)}
                              disabled={actionLoading === trx.id}
                              className="w-full inline-flex items-center justify-center gap-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 disabled:opacity-50"
                            >
                              {actionLoading === trx.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                              Konfirmasi Pembayaran
                            </button>
                          </div>
                        )}
                        {trx.status === "success" && (
                          <div className="mt-3 pt-3 border-t border-[rgba(99,102,241,0.08)]">
                            <button
                              onClick={() => openStatusModal(trx)}
                              className="w-full inline-flex items-center justify-center gap-1 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white border border-indigo-500/20 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200"
                            >
                              Ubah Status
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ── Load More Footer ── */}
              <div className="flex flex-col sm:flex-row items-center justify-between px-4 md:px-6 py-4 border-t border-[rgba(99,102,241,0.08)] gap-3">
                <p className="text-sm text-[var(--text-muted)]">
                  Menampilkan{" "}
                  <span className="font-semibold text-[var(--text-primary)]">{transactions.length}</span> dari{" "}
                  <span className="font-semibold text-[var(--text-primary)]">{total}</span> transaksi
                </p>
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
                    {loadingMore ? "Memuat..." : `Tampilkan ${Math.min(limit, total - transactions.length)} data berikutnya`}
                  </button>
                ) : !loading && transactions.length > 0 ? (
                  <span className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                    <CheckCircle size={12} className="text-emerald-400" /> Semua data sudah ditampilkan
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Modal Cek User (dari filter Masa Aktif) ── */}
      {showUserModal && (() => {
        // Deduplikasi user dari transaksi yang sudah difilter
        const userMap = new Map<string, {
          id: string; name: string; email: string; whatsapp: string | null;
          productName: string | null; purchaseDate: string | null;
          warrantyExpiredAt: string | null; amount: number;
        }>();
        transactions.forEach(trx => {
          if (!trx.user?.id) return;
          if (!userMap.has(trx.user.id)) {
            userMap.set(trx.user.id, {
              id: trx.user.id,
              name: trx.user.name,
              email: trx.user.email,
              whatsapp: trx.user.whatsapp,
              productName: trx.productName,
              purchaseDate: trx.purchaseDate,
              warrantyExpiredAt: trx.warrantyExpiredAt,
              amount: trx.amount,
            });
          }
        });
        const users = Array.from(userMap.values());
        const usersWithWA = users.filter(u => u.whatsapp);

        // WA Template options for the popup
        const WA_TEMPLATE_OPTIONS = [
          { key: "template_wa_expired", label: "📋 WA Expired", color: "#22c55e", desc: "Template default expired" },
          { key: "template_followup", label: "🔔 Follow-Up", color: "#818cf8", desc: "Template follow-up" },
          { key: "template_promo", label: "🔥 Promo", color: "#f59e0b", desc: "Template promo" },
          { key: "custom", label: "✏️ Custom", color: "#a78bfa", desc: "Tulis pesan sendiri" },
        ];

        function getActiveWAMessage(customerName: string) {
          if (selectedWATemplate === "custom") {
            return customWAMessage.replace(/\{\{nama\}\}/g, customerName).replace(/\{\{nama_customer\}\}/g, customerName);
          }
          const tpl = settingsTemplates[selectedWATemplate] || "";
          return tpl.replace(/\{\{nama\}\}/g, customerName).replace(/\{\{nama_customer\}\}/g, customerName);
        }

        function openWA(phone: string | null, name: string) {
          if (!phone) return;
          const num = phone.replace(/^0/, "62").replace(/\D/g, "");
          const msg = encodeURIComponent(getActiveWAMessage(name));
          window.open(`https://wa.me/${num}?text=${msg}`, "_blank");
        }

        function closeUserModal() {
          setShowUserModal(false);
          setExportStep(1);
          setExportResult(null);
        }

        async function handleCreateFollowUp() {
          if (!exportTitle || !exportTemplate || !exportDate || usersWithWA.length === 0) return;
          setExportSubmitting(true);
          setExportResult(null);
          try {
            const recipients = usersWithWA.map(u => ({
              whatsappNumber: (u.whatsapp as string).replace(/^0/, "62").replace(/\D/g, ""),
              customerName: u.name,
            }));
            const scheduledAtWIB = exportDate.includes("+") || exportDate.endsWith("Z") ? exportDate : exportDate + ":00+07:00";
            const res = await fetch("/api/followups", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: exportTitle,
                messageTemplate: exportTemplate,
                scheduledAt: scheduledAtWIB,
                recipients,
              }),
            });
            if (res.ok) {
              setExportResult({ ok: true, message: `Jadwal follow-up berhasil dibuat untuk ${recipients.length} pelanggan!` });
            } else {
              const err = await res.json();
              setExportResult({ ok: false, message: err.error || "Gagal membuat jadwal" });
            }
          } catch {
            setExportResult({ ok: false, message: "Koneksi error" });
          }
          setExportSubmitting(false);
        }

        return (
          <div className="modal-overlay" onClick={closeUserModal}>
            <div
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 640 }}
            >
              <div className="modal-header">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-[#818cf8]" />
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)] text-lg">
                      {exportStep === 1 ? "Daftar Pelanggan" : "Buat Jadwal Follow-Up"}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)]">
                      {exportStep === 1
                        ? `${users.length} pelanggan dari hasil filter masa aktif`
                        : `${usersWithWA.length} penerima akan dijadwalkan`}
                    </p>
                  </div>
                </div>
                <button className="btn-icon" onClick={closeUserModal}>
                  <X size={18} />
                </button>
              </div>

              {/* ── STEP 1: Daftar User ── */}
              {exportStep === 1 && (
                <>
                  <div className="modal-body" style={{ maxHeight: 420, overflowY: "auto", padding: 0 }}>
                    {/* ── Template Selector ── */}
                    <div
                      className="px-5 py-3"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <button
                        onClick={() => setShowTemplateSettings(v => !v)}
                        className="flex items-center gap-2 w-full text-left mb-2"
                      >
                        <MessageCircle size={13} className="text-emerald-400 flex-shrink-0" />
                        <span className="text-xs font-semibold text-[var(--text-primary)] flex-1">Template Pesan WA</span>
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{
                            background: `${WA_TEMPLATE_OPTIONS.find(o => o.key === selectedWATemplate)?.color || "#818cf8"}18`,
                            color: WA_TEMPLATE_OPTIONS.find(o => o.key === selectedWATemplate)?.color || "#818cf8",
                          }}
                        >
                          {WA_TEMPLATE_OPTIONS.find(o => o.key === selectedWATemplate)?.label || "Custom"}
                        </span>
                        <ChevronDown
                          size={12}
                          className="text-[var(--text-muted)] flex-shrink-0 transition-transform"
                          style={{ transform: showTemplateSettings ? "rotate(180deg)" : undefined }}
                        />
                      </button>

                      {showTemplateSettings && (
                        <div className="space-y-2.5 mt-2 animate-in">
                          {/* Template pills */}
                          <div className="flex flex-wrap gap-1.5">
                            {WA_TEMPLATE_OPTIONS.map(opt => (
                              <button
                                key={opt.key}
                                onClick={() => setSelectedWATemplate(opt.key)}
                                className="text-[11px] px-2.5 py-1.5 rounded-lg transition-all font-medium"
                                style={{
                                  background: selectedWATemplate === opt.key ? `${opt.color}20` : "rgba(255,255,255,0.04)",
                                  border: `1px solid ${selectedWATemplate === opt.key ? `${opt.color}45` : "rgba(255,255,255,0.08)"}`,
                                  color: selectedWATemplate === opt.key ? opt.color : "var(--text-muted)",
                                }}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>

                          {/* Preview / edit area */}
                          {selectedWATemplate === "custom" ? (
                            <div className="space-y-1.5">
                              <textarea
                                className="form-input w-full text-xs"
                                rows={4}
                                value={customWAMessage}
                                onChange={e => setCustomWAMessage(e.target.value)}
                                placeholder="Tulis pesan custom kamu di sini...&#10;Gunakan {{nama}} untuk nama pelanggan"
                                style={{ resize: "none", fontSize: 11 }}
                              />
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-[var(--text-muted)]">Variabel:</span>
                                <button
                                  type="button"
                                  onClick={() => setCustomWAMessage(prev => prev + "{{nama}}")}
                                  className="text-[10px] px-1.5 py-0.5 rounded-md"
                                  style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", color: "#a78bfa" }}
                                >
                                  {"{{nama}}"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className="p-2.5 rounded-xl text-[11px] leading-relaxed whitespace-pre-wrap"
                              style={{
                                background: "rgba(0,0,0,0.25)",
                                border: "1px solid rgba(255,255,255,0.06)",
                                color: "var(--text-secondary)",
                                maxHeight: 120,
                                overflowY: "auto",
                              }}
                            >
                              {(settingsTemplates[selectedWATemplate] || "Template belum diatur. Atur di halaman Pengaturan.").replace(/\{\{nama\}\}/g, "Nama Pelanggan")}
                            </div>
                          )}

                          <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                            <ExternalLink size={9} />
                            Edit template permanen di menu{" "}
                            <button
                              onClick={() => router.push("/settings")}
                              className="underline text-[#818cf8] hover:text-[#a5b4fc] transition-colors"
                            >
                              Pengaturan
                            </button>
                          </p>
                        </div>
                      )}
                    </div>

                    {/* ── User list ── */}
                    {users.length === 0 ? (
                      <div className="py-10 flex flex-col items-center gap-2">
                        <Users size={24} className="text-[var(--text-muted)]" />
                        <p className="text-sm text-[var(--text-muted)]">Tidak ada data pelanggan</p>
                      </div>
                    ) : (
                      <div>
                        {users.map((u, idx) => {
                          const isExpired = u.warrantyExpiredAt && new Date(u.warrantyExpiredAt) < new Date();
                          return (
                            <div
                              key={u.id}
                              className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-white/3"
                              style={{
                                borderBottom: idx < users.length - 1 ? "1px solid rgba(255,255,255,0.04)" : undefined,
                              }}
                            >
                              <div
                                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                                style={{
                                  background: isExpired
                                    ? "linear-gradient(135deg, #ef4444, #dc2626)"
                                    : "linear-gradient(135deg, #22c55e, #16a34a)",
                                }}
                              >
                                {u.name?.charAt(0)?.toUpperCase() || "?"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{u.name}</p>
                                <p className="text-[11px] text-[var(--text-muted)] truncate">{maskEmail(u.email)}</p>
                                <div className="flex items-center gap-3 mt-1 flex-wrap">
                                  <span className="text-[10px] text-[var(--text-muted)]">{u.productName || "CapCut Pro"}</span>
                                  <span className="text-[10px] text-[var(--text-muted)]">s/d {formatDate(u.warrantyExpiredAt)}</span>
                                  {getActiveBadge(u.warrantyExpiredAt)}
                                </div>
                              </div>
                              <button
                                onClick={() => openWA(u.whatsapp, u.name)}
                                disabled={!u.whatsapp}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-shrink-0"
                                style={{
                                  background: u.whatsapp ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.03)",
                                  border: `1px solid ${u.whatsapp ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.06)"}`,
                                  color: u.whatsapp ? "#4ade80" : "var(--text-muted)",
                                  cursor: u.whatsapp ? "pointer" : "not-allowed",
                                }}
                              >
                                <MessageCircle size={12} />
                                WA
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {users.length > 0 && (
                    <div className="modal-footer" style={{ justifyContent: "space-between" }}>
                      <p className="text-xs text-[var(--text-muted)]">
                        {users.filter(u => u.warrantyExpiredAt && new Date(u.warrantyExpiredAt) < new Date()).length} expired
                        {" · "}
                        {users.filter(u => u.warrantyExpiredAt && new Date(u.warrantyExpiredAt) >= new Date()).length} aktif
                      </p>
                      <button
                        onClick={() => { setExportStep(2); setExportTitle(`Follow-up Expired ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`); }}
                        disabled={usersWithWA.length === 0}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                        style={{
                          background: usersWithWA.length > 0 ? "linear-gradient(135deg, #4f46e5, #6366f1)" : "rgba(255,255,255,0.05)",
                          color: usersWithWA.length > 0 ? "white" : "var(--text-muted)",
                          border: "none",
                          cursor: usersWithWA.length > 0 ? "pointer" : "not-allowed",
                        }}
                      >
                        <Send size={13} />
                        Buat Jadwal Follow-Up ({usersWithWA.length})
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* ── STEP 2: Form Jadwal Follow-Up ── */}
              {exportStep === 2 && (
                <>
                  <div className="modal-body space-y-4">
                    {exportResult?.ok ? (
                      <div className="py-6 flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)" }}>
                          <Check size={28} className="text-emerald-400" />
                        </div>
                        <p className="text-sm font-semibold text-emerald-300 text-center">{exportResult.message}</p>
                        <p className="text-xs text-[var(--text-muted)] text-center">Jadwal akan diproses otomatis pada waktu yang ditentukan.</p>
                      </div>
                    ) : (
                      <>
                        {/* Judul */}
                        <div>
                          <label className="form-label">Judul Follow-Up</label>
                          <input
                            type="text"
                            className="form-input"
                            value={exportTitle}
                            onChange={(e) => setExportTitle(e.target.value)}
                            placeholder="Follow-up Akun Expired"
                          />
                        </div>

                        {/* Template pesan */}
                        <div>
                          <label className="form-label">Template Pesan WA</label>
                          {/* Template picker pills */}
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {[
                              { key: "template_followup", label: "📋 Follow-Up", color: "#818cf8" },
                              { key: "template_promo", label: "🔥 Promo", color: "#f59e0b" },
                            ].map(tp => (
                              <button
                                key={tp.key}
                                type="button"
                                onClick={() => {
                                  const tpl = settingsTemplates[tp.key];
                                  if (tpl) setExportTemplate(tpl.replace(/\{\{nama\}\}/g, "{{nama_customer}}"));
                                }}
                                className="text-[11px] px-2.5 py-1 rounded-lg transition-all hover:opacity-80"
                                style={{ background: `${tp.color}15`, border: `1px solid ${tp.color}30`, color: tp.color }}
                              >
                                {tp.label}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setExportTemplate("")}
                              className="text-[11px] px-2.5 py-1 rounded-lg transition-all hover:opacity-80"
                              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)" }}
                            >
                              ✏️ Kosongkan
                            </button>
                          </div>
                          <textarea
                            className="form-input"
                            rows={4}
                            value={exportTemplate}
                            onChange={(e) => setExportTemplate(e.target.value)}
                            style={{ resize: "none" }}
                          />
                          {/* Variable buttons */}
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-[10px] text-[var(--text-muted)]">Variabel:</span>
                            {[
                              { v: "{{nama_customer}}", label: "Nama" },
                            ].map(vr => (
                              <button
                                key={vr.v}
                                type="button"
                                onClick={() => setExportTemplate(exportTemplate + vr.v)}
                                className="text-[10px] px-2 py-0.5 rounded-md transition-all hover:opacity-80"
                                style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", color: "#a78bfa" }}
                              >
                                {vr.v}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Tanggal & Jam */}
                        <div>
                          <label className="form-label">Tanggal &amp; Jam Kirim</label>
                          <input
                            type="datetime-local"
                            className="form-input"
                            value={exportDate}
                            onChange={(e) => setExportDate(e.target.value)}
                          />
                        </div>

                        {/* Ringkasan penerima */}
                        <div
                          className="p-3 rounded-xl flex items-center gap-3"
                          style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}
                        >
                          <Users size={16} className="text-[#818cf8] flex-shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">{usersWithWA.length} penerima</p>
                            <p className="text-[11px] text-[var(--text-muted)]">
                              {usersWithWA.slice(0, 3).map(u => u.name).join(", ")}
                              {usersWithWA.length > 3 ? `, +${usersWithWA.length - 3} lainnya` : ""}
                            </p>
                          </div>
                        </div>

                        {exportResult && !exportResult.ok && (
                          <div className="p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                            <p className="text-sm text-rose-400">{exportResult.message}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="modal-footer">
                    {exportResult?.ok ? (
                      <button className="btn-primary" onClick={closeUserModal}>
                        <Check size={14} /> Selesai
                      </button>
                    ) : (
                      <>
                        <button className="btn-secondary" onClick={() => { setExportStep(1); setExportResult(null); }}>Kembali</button>
                        <button
                          className="btn-primary"
                          onClick={handleCreateFollowUp}
                          disabled={exportSubmitting || !exportTitle || !exportTemplate || !exportDate}
                        >
                          {exportSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                          {exportSubmitting ? "Membuat..." : `Buat Jadwal (${usersWithWA.length})`}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Modal Tambah Manual */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="font-semibold text-[var(--text-primary)] text-lg flex items-center gap-2"><Send size={18} className="text-[#818cf8]" /> Transaksi Manual</h3>
              <button className="btn-icon" onClick={closeModal}><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              {result?.success ? (
                <>
                  {/* Sukses — pilih kirim akun atau tidak */}
                  <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-center gap-2">
                    <Check size={16} className="text-emerald-400 flex-shrink-0" />
                    <p className="font-semibold text-emerald-300 text-sm">{result.message}</p>
                  </div>

                  {!sendResult && (
                    <>
                      <p className="text-sm text-[var(--text-secondary)]">Pilih jenis akun yang akan dikirim ke pelanggan:</p>

                      {/* Toggle Mobile / Desktop */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setAccountType('mobile')}
                          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border transition-all`}
                          style={{
                            background: accountType === 'mobile' ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${accountType === 'mobile' ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.08)'}`,
                            color: accountType === 'mobile' ? '#22c55e' : 'var(--text-muted)',
                          }}
                        >
                          <Smartphone size={16} /> Mobile
                          <span style={{ fontSize: 10 }}>(HP/iPad)</span>
                        </button>
                        <button
                          onClick={() => setAccountType('desktop')}
                          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border transition-all`}
                          style={{
                            background: accountType === 'desktop' ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${accountType === 'desktop' ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`,
                            color: accountType === 'desktop' ? '#818cf8' : 'var(--text-muted)',
                          }}
                        >
                          <Monitor size={16} /> Desktop
                          <span style={{ fontSize: 10 }}>(PC/Mac)</span>
                        </button>
                      </div>

                      <p className="text-[11px] text-[var(--text-muted)]">
                        Akun <strong style={{ color: accountType === 'mobile' ? '#22c55e' : '#818cf8' }}>{accountType === 'mobile' ? 'Mobile' : 'Desktop'}</strong> tersedia akan diambil dari stok dan dikirim otomatis ke pelanggan via webhook.
                      </p>
                    </>
                  )}

                  {/* Hasil kirim */}
                  {sendResult && (
                    <div
                      className="p-3 rounded-xl flex items-start gap-2"
                      style={{
                        background: sendResult.sent ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                        border: `1px solid ${sendResult.sent ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                      }}
                    >
                      {sendResult.sent
                        ? <Check size={15} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                        : <X size={15} className="text-rose-400 mt-0.5 flex-shrink-0" />}
                      <div>
                        <p className={`text-sm font-semibold ${sendResult.sent ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {sendResult.message}
                        </p>
                        {sendResult.accountEmail && (
                          <p className="text-xs text-[var(--text-muted)] mt-0.5 font-mono">{sendResult.accountEmail}</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div><label className="form-label">Nama Pelanggan</label><input type="text" className="form-input" placeholder="Nama lengkap" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div><label className="form-label">Email Pelanggan</label><input type="email" className="form-input" placeholder="email@gmail.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} pattern="[^\s@]+@[^\s@]+\.[^\s@]+" /></div>
                  <div><label className="form-label">Nomor WhatsApp</label><input type="text" className="form-input" placeholder="08xxxxxxxxxx" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value.replace(/\D/g, '') })} /></div>
                  <div>
                    <label className="form-label">Nama Produk (Opsional)</label>
                    <input 
                      type="text" 
                      className="form-input transition-all duration-200 disabled:opacity-40 disabled:bg-slate-950/80 disabled:border-gray-800/50 disabled:text-gray-500 disabled:cursor-not-allowed" 
                      placeholder="CapCut Pro PC 1 Bulan" 
                      value={form.productId ? "" : form.productName} 
                      disabled={!!form.productId}
                      onChange={(e) => setForm({ ...form, productName: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="form-label">Produk Terkait</label>
                    <select 
                      className="form-input transition-all duration-200 disabled:opacity-40 disabled:bg-slate-950/80 disabled:border-gray-800/50 disabled:text-gray-500 disabled:cursor-not-allowed" 
                      value={form.productId} 
                      disabled={!form.productId && !!form.productName}
                      onChange={(e) => {
                        const pid = e.target.value;
                        const p = products.find(prod => prod.id === pid);
                        setForm({ ...form, productId: pid, productName: p ? p.name : "", durationDays: p ? p.duration : 30 });
                      }}
                    >
                      <option value="">Pilih Produk (Opsional)</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.maxSlots === 2 ? "Desktop" : "Mobile"})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Sumber</label>
                    <select
                      className="form-input"
                      value={form.source}
                      onChange={(e) => setForm({ ...form, source: e.target.value })}
                    >
                      <option value="Lynk.id">Lynk.id</option>
                      <option value="Manual">Manual</option>
                      <option value="Website">Website</option>
                      <option value="Shopee">Shopee</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Tanggal aktif</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      style={{ colorScheme: "dark" }}
                      value={form.activeDate} 
                      onChange={(e) => setForm({ ...form, activeDate: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="form-label">Durasi (Hari)</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      placeholder="30" 
                      value={form.durationDays} 
                      disabled={!!form.productId}
                      onChange={(e) => setForm({ ...form, durationDays: parseInt(e.target.value) || 30 })} 
                    />
                  </div>
                  <div><label className="form-label">Nominal (Rp)</label><input type="number" className="form-input" placeholder="35000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                  {result?.message && <p className="text-sm text-rose-400">{result.message}</p>}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeModal}>Tutup{result?.success ? " saja" : ""}</button>
              {!result?.success ? (
                <button className="btn-success" onClick={handleAddManual} disabled={submitting}>
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Simpan Transaksi
                </button>
              ) : !sendResult ? (
                <button
                  onClick={handleSendAccount}
                  disabled={sendingAccount}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '0 16px', height: 38, borderRadius: 10,
                    background: accountType === 'mobile'
                      ? 'linear-gradient(135deg, #16a34a, #22c55e)'
                      : 'linear-gradient(135deg, #4f46e5, #6366f1)',
                    border: 'none', color: 'white', fontSize: 13, fontWeight: 600,
                    cursor: sendingAccount ? 'wait' : 'pointer',
                  }}
                >
                  {sendingAccount
                    ? <Loader2 size={14} className="animate-spin" />
                    : accountType === 'mobile' ? <Smartphone size={14} /> : <Monitor size={14} />}
                  Kirim Akun {accountType === 'mobile' ? 'Mobile' : 'Desktop'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Modal Ubah Status Transaksi */}
      {showStatusModal && selectedTrxForStatus && (
        <div className="modal-overlay" onClick={() => { setShowStatusModal(false); setSelectedTrxForStatus(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="font-semibold text-[var(--text-primary)] text-lg flex items-center gap-2">
                Ubah Status Transaksi
              </h3>
              <button className="btn-icon" onClick={() => { setShowStatusModal(false); setSelectedTrxForStatus(null); }}><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="bg-[var(--bg-primary)] p-3 rounded-xl space-y-1 text-sm text-[var(--text-secondary)]">
                <p><strong>Nama:</strong> {selectedTrxForStatus.user?.name || "-"}</p>
                <p><strong>Produk:</strong> {selectedTrxForStatus.productName || "CapCut Pro"}</p>
                <p><strong>Nominal:</strong> {formatCurrency(Number(selectedTrxForStatus.amount))}</p>
                <p><strong>Status Saat Ini:</strong> {getStatusBadge(selectedTrxForStatus.status)}</p>
              </div>
              <div className="space-y-2">
                <label className="form-label">Pilih Status Baru</label>
                <select
                  className="form-input"
                  value={newStatusSelection}
                  onChange={(e) => setNewStatusSelection(e.target.value)}
                >
                  <option value="success">Sukses</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Gagal</option>
                </select>
              </div>
              {newStatusSelection !== "success" && (
                <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/5 text-xs text-rose-400">
                  ⚠️ Mengubah status dari Sukses ke {newStatusSelection === "pending" ? "Pending" : "Gagal"} akan melepaskan/mengurangi slot akun yang dialokasikan jika ada.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => { setShowStatusModal(false); setSelectedTrxForStatus(null); }}>Batal</button>
              <button className="btn-primary" onClick={handleUpdateStatus} disabled={updatingStatus}>
                {updatingStatus ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Floating badge saat import di-minimize ── */}
      {(importing || importDone) && importMinimized && (
        <div
          onClick={() => { setImportMinimized(false); setShowImportModal(true); }}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer shadow-2xl"
          style={{ background: "linear-gradient(135deg, #4f46e5, #6366f1)", border: "1px solid rgba(129,140,248,0.4)", minWidth: 240 }}
        >
          {importing ? (
            <Loader2 size={16} className="animate-spin text-white flex-shrink-0" />
          ) : (
            <CheckCircle size={16} className="text-emerald-300 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            {importing && importProgress ? (
              <>
                <p className="text-xs font-semibold text-white">
                  File {importProgress.fileIndex + 1}/{importProgress.totalFiles} — Batch {importProgress.currentBatch}/{importProgress.totalBatches}
                </p>
                <div className="h-1 mt-1.5 rounded-full overflow-hidden bg-white/20">
                  <div
                    className="h-full rounded-full transition-all duration-300 bg-white"
                    style={{ width: `${importProgress.totalRows > 0 ? Math.round((importProgress.currentRows / importProgress.totalRows) * 100) : 0}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs font-semibold text-white">Import selesai! Klik untuk lihat hasil.</p>
            )}
          </div>
          <Maximize2 size={14} className="text-white/70 flex-shrink-0" />
        </div>
      )}

      {/* ── Modal Import Lynk.id ── */}
      {showImportModal && !importMinimized && (
        <div className="modal-overlay" onClick={() => { if (!importing) closeImportModal(); }}>
          <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="font-semibold text-[var(--text-primary)] text-lg flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-[#818cf8]" /> Import Data Lynk.id
              </h3>
              <div className="flex items-center gap-1">
                {importing && (
                  <button
                    className="btn-icon"
                    title="Minimize — import tetap berjalan"
                    onClick={() => { setImportMinimized(true); setShowImportModal(false); }}
                  >
                    <Minimize2 size={16} />
                  </button>
                )}
                <button className="btn-icon" onClick={closeImportModal} disabled={importing}>
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="modal-body space-y-4">
              {/* ── File picker (hanya tampil jika belum mulai) ── */}
              {!importing && !importDone && (
                <div className="p-4 rounded-xl space-y-3" style={{ background: "var(--bg-secondary)", border: "1px dashed var(--border-color)" }}>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Pilih satu atau beberapa file Lynk.id (<span className="text-[var(--text-primary)] font-medium">.csv</span>, <span className="text-[var(--text-primary)] font-medium">.xlsx</span>, <span className="text-[var(--text-primary)] font-medium">.json</span>). Akan diproses dari <span className="text-[#818cf8] font-medium">terbaru → terlama</span>.
                  </p>
                  <input
                    type="file"
                    accept=".json,.csv,.xlsx,.xls"
                    multiple
                    onChange={handleFileSelect}
                    className="block w-full text-sm text-[var(--text-secondary)] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-[rgba(99,102,241,0.15)] file:text-[#818cf8] hover:file:bg-[rgba(99,102,241,0.25)] file:cursor-pointer file:transition-colors"
                  />
                </div>
              )}

              {/* ── Daftar file ── */}
              {importFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[var(--text-muted)] flex items-center gap-1.5">
                    <Files size={12} /> {importFiles.length} file — urutan proses (terbaru → terlama)
                  </p>
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {importFiles.map((job, idx) => {
                      const isActive = importing && importProgress?.fileIndex === idx;
                      const pct = isActive && importProgress && importProgress.totalRows > 0
                        ? Math.round((importProgress.currentRows / importProgress.totalRows) * 100)
                        : job.status === 'done' || job.status === 'error' ? 100 : 0;

                      return (
                        <div key={idx} className="p-3 rounded-xl" style={{
                          background: job.status === 'done' ? "rgba(34,197,94,0.06)"
                            : job.status === 'error' ? "rgba(239,68,68,0.06)"
                            : job.status === 'importing' ? "rgba(99,102,241,0.08)"
                            : "rgba(255,255,255,0.03)",
                          border: `1px solid ${job.status === 'done' ? "rgba(34,197,94,0.2)"
                            : job.status === 'error' ? "rgba(239,68,68,0.2)"
                            : job.status === 'importing' ? "rgba(99,102,241,0.25)"
                            : "rgba(255,255,255,0.06)"}`
                        }}>
                          <div className="flex items-center gap-2 mb-1">
                            {job.status === 'waiting' && <Clock size={13} className="text-[var(--text-muted)] flex-shrink-0" />}
                            {job.status === 'importing' && <Loader2 size={13} className="animate-spin text-[#818cf8] flex-shrink-0" />}
                            {job.status === 'done' && <CheckCircle size={13} className="text-emerald-400 flex-shrink-0" />}
                            {job.status === 'error' && <AlertTriangle size={13} className="text-rose-400 flex-shrink-0" />}
                            <span className="text-xs font-medium text-white truncate flex-1">{job.file.name}</span>
                            <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">{(job.file.size / 1024).toFixed(0)} KB</span>
                          </div>

                          {/* Progress bar per file */}
                          {(isActive || job.status === 'done' || job.status === 'error') && (
                            <div className="h-1 rounded-full overflow-hidden mb-1.5" style={{ background: "rgba(99,102,241,0.15)" }}>
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                  width: `${pct}%`,
                                  background: job.status === 'done' ? "#22c55e"
                                    : job.status === 'error' ? "#ef4444"
                                    : "linear-gradient(90deg, #6366f1, #818cf8)"
                                }}
                              />
                            </div>
                          )}

                          {/* Stats */}
                          <div className="flex items-center gap-3 flex-wrap">
                            {isActive && importProgress && (
                              <span className="text-[10px] text-[#818cf8]">
                                Batch {importProgress.currentBatch}/{importProgress.totalBatches} · {importProgress.currentRows}/{importProgress.totalRows} baris
                              </span>
                            )}
                            {job.status === 'done' && (
                              <>
                                <span className="text-[10px] text-emerald-400">✓ {job.created} dibuat</span>
                                {job.skippedNonSuccess > 0 && <span className="text-[10px] text-orange-400">⊘ {job.skippedNonSuccess} pending/gagal</span>}
                                {job.skipped > 0 && <span className="text-[10px] text-yellow-400">⊘ {job.skipped} duplikat</span>}
                              </>
                            )}
                            {job.status === 'waiting' && <span className="text-[10px] text-[var(--text-muted)]">Menunggu...</span>}
                            {job.status === 'error' && job.errors.length > 0 && (
                              <span className="text-[10px] text-rose-400 truncate">{job.errors[0]}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Ringkasan total setelah selesai ── */}
              {importDone && (
                <div className="p-3 rounded-xl" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
                  <p className="text-sm font-semibold text-emerald-300 flex items-center gap-2 mb-2">
                    <CheckCircle size={15} /> Semua file selesai diproses!
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Transaksi Dibuat", val: importFiles.reduce((a, j) => a + j.created, 0), color: "text-emerald-400" },
                      { label: "Pending/Gagal Dilewati", val: importFiles.reduce((a, j) => a + j.skippedNonSuccess, 0), color: "text-orange-400" },
                      { label: "Duplikat Dilewati", val: importFiles.reduce((a, j) => a + j.skipped, 0), color: "text-yellow-400" },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="text-center p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                        <p className={`text-base font-bold ${color}`}>{val}</p>
                        <p className="text-[9px] text-[var(--text-muted)]">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Info box ── */}
              {!importDone && importFiles.length === 0 && (
                <div className="p-3 rounded-xl" style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.12)" }}>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    <span className="text-[#818cf8] font-semibold">ℹ️ Info:</span> Data user otomatis dibuat/diperbarui. Duplikat (ID Lynk.id sama) otomatis dilewati. Bisa pilih banyak file sekaligus.
                  </p>
                </div>
              )}
            </div>

            <div className="modal-footer">
              {importDone ? (
                <button className="btn-secondary" onClick={closeImportModal}>Tutup</button>
              ) : importing ? (
                <button className="btn-secondary" onClick={() => { setImportMinimized(true); setShowImportModal(false); }}>
                  <Minimize2 size={14} /> Sembunyikan
                </button>
              ) : (
                <>
                  <button className="btn-secondary" onClick={closeImportModal}>Batal</button>
                  <button
                    className="btn-primary gap-2 disabled:opacity-50"
                    onClick={handleImport}
                    disabled={importFiles.length === 0}
                  >
                    <Upload size={16} />
                    Mulai Import {importFiles.length > 1 ? `(${importFiles.length} file)` : ""}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
