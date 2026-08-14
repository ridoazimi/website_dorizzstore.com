"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import Topbar from "@/components/Topbar";
import {
  ArrowLeft,
  Check,
  CheckCircle,
  Download,
  FileSpreadsheet,
  Loader2,
  Plus,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  duration?: number | null;
  maxSlots?: number | null;
};

type BulkRow = {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  amount: string;
  productName: string;
  productId: string;
  source: string;
  activeDate: string;
  durationDays: string;
};

type BulkSummary = {
  total: number;
  valid?: number;
  created: number;
  failed: number;
  usersCreated?: number;
  usersUpdated?: number;
  errors?: Array<{ row: number; message: string }>;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOURCES = ["Manual", "Website", "Shopee", "Lynk.id"];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function newRow(overrides: Partial<BulkRow> = {}): BulkRow {
  return {
    id: crypto.randomUUID(),
    name: "",
    email: "",
    whatsapp: "",
    amount: "",
    productName: "",
    productId: "",
    source: "Manual",
    activeDate: todayKey(),
    durationDays: "30",
    ...overrides,
  };
}

function cleanPhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function valueByAliases(record: Record<string, unknown>, aliases: string[]) {
  const entries = Object.entries(record);
  for (const alias of aliases) {
    const found = entries.find(([key]) => normalizeHeader(key) === alias);
    if (found) return found[1];
  }
  return "";
}

function normalizeDate(value: unknown) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function rowFromRecord(record: Record<string, unknown>, defaults: BulkRow): BulkRow {
  const productName = String(valueByAliases(record, ["produk", "nama produk", "product", "product name"]) || "").trim();
  const source = String(valueByAliases(record, ["sumber", "source", "channel"]) || defaults.source).trim();
  const date = normalizeDate(valueByAliases(record, ["tanggal aktif", "tanggal", "active date", "purchase date", "tanggal beli"])) || defaults.activeDate;

  return newRow({
    name: String(valueByAliases(record, ["nama", "nama pelanggan", "name", "customer name"]) || "").trim(),
    email: String(valueByAliases(record, ["email", "email pelanggan", "customer email"]) || "").trim().toLowerCase(),
    whatsapp: cleanPhone(valueByAliases(record, ["whatsapp", "wa", "nomor whatsapp", "no hp", "phone", "nomor hp"])),
    amount: String(valueByAliases(record, ["nominal", "amount", "harga", "price", "total"]) || defaults.amount).trim(),
    productName: productName || defaults.productName,
    productId: "",
    source: SOURCES.find((item) => item.toLowerCase() === source.toLowerCase()) || defaults.source,
    activeDate: date,
    durationDays: String(valueByAliases(record, ["durasi", "durasi hari", "duration", "duration days"]) || defaults.durationDays).trim() || "30",
  });
}

function parseDelimited(text: string) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((line) => line.trim());
  if (!lines.length) return [] as string[][];
  const sample = lines[0];
  const delimiters = ["\t", ";", "|", ","];
  const delimiter = delimiters.sort((a, b) => sample.split(b).length - sample.split(a).length)[0];
  return lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
}

export default function BulkTransactionsPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState<BulkRow[]>([newRow()]);
  const [pasteText, setPasteText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<BulkSummary | null>(null);
  const [error, setError] = useState("");
  const [defaults, setDefaults] = useState<BulkRow>(() => newRow());

  useEffect(() => {
    fetch("/api/products/list")
      .then((res) => res.json())
      .then((json) => setProducts(json.products || []))
      .catch(() => setProducts([]));
  }, []);

  const validation = useMemo(() => rows.map((row) => {
    const errors: string[] = [];
    if (!row.name.trim()) errors.push("nama");
    if (!EMAIL_RE.test(row.email.trim())) errors.push("email");
    if (!cleanPhone(row.whatsapp)) errors.push("WhatsApp");
    return errors;
  }), [rows]);

  const validCount = validation.filter((item) => item.length === 0).length;
  const invalidCount = rows.length - validCount;

  function updateRow(id: string, patch: Partial<BulkRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function applyDefaultsToBlankRows() {
    setRows((current) => current.map((row) => ({
      ...row,
      amount: row.amount || defaults.amount,
      productName: row.productName || defaults.productName,
      productId: row.productId || defaults.productId,
      source: row.source || defaults.source,
      activeDate: row.activeDate || defaults.activeDate,
      durationDays: row.durationDays || defaults.durationDays,
    })));
  }

  function parsePaste() {
    setError("");
    const grid = parseDelimited(pasteText);
    if (!grid.length) {
      setError("Belum ada data yang ditempel.");
      return;
    }

    const first = grid[0].map((cell) => normalizeHeader(cell));
    const hasHeader = first.some((cell) => ["nama", "nama pelanggan", "name", "email", "whatsapp", "wa", "nomor whatsapp"].includes(cell));
    const dataRows = hasHeader ? grid.slice(1) : grid;
    const parsed = dataRows.map((cells) => {
      if (hasHeader) {
        const record: Record<string, unknown> = {};
        grid[0].forEach((header, index) => { record[header] = cells[index] ?? ""; });
        return rowFromRecord(record, defaults);
      }
      return newRow({
        name: cells[0] || "",
        email: (cells[1] || "").toLowerCase(),
        whatsapp: cleanPhone(cells[2] || ""),
        amount: cells[3] || defaults.amount,
        productName: cells[4] || defaults.productName,
        productId: defaults.productId,
        source: cells[5] || defaults.source,
        activeDate: normalizeDate(cells[6]) || defaults.activeDate,
        durationDays: cells[7] || defaults.durationDays,
      });
    }).filter((row) => row.name || row.email || row.whatsapp);

    if (!parsed.length) {
      setError("Tidak ada baris customer yang terbaca.");
      return;
    }
    setRows(parsed.slice(0, 500));
    setSummary(null);
  }

  async function handleFile(file: File) {
    setError("");
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("File tidak memiliki sheet.");
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });
      const parsed = records.map((record) => rowFromRecord(record, defaults)).filter((row) => row.name || row.email || row.whatsapp);
      if (!parsed.length) throw new Error("Tidak ada data customer yang terbaca. Pastikan ada kolom Nama, Email, dan WhatsApp.");
      setRows(parsed.slice(0, 500));
      setSummary(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "File gagal dibaca.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const data = [
      ["Nama", "Email", "WhatsApp", "Nominal", "Produk", "Sumber", "Tanggal Aktif", "Durasi Hari"],
      ["Budi Santoso", "budi@gmail.com", "081234567890", "25000", "CapCut Pro HP 30 Hari", "Manual", todayKey(), "30"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Input Massal");
    XLSX.writeFile(wb, "template-input-massal-dorizz.xlsx");
  }

  async function submitBulk() {
    setError("");
    setSummary(null);
    if (!rows.length || validCount === 0) {
      setError("Tidak ada baris valid untuk disimpan.");
      return;
    }
    if (invalidCount > 0) {
      setError(`Masih ada ${invalidCount} baris yang belum valid. Lengkapi Nama, Email, dan WhatsApp.`);
      return;
    }

    setSubmitting(true);
    const CHUNK = 50;
    const combined: BulkSummary = { total: rows.length, created: 0, failed: 0, usersCreated: 0, usersUpdated: 0, errors: [] };
    setProgress({ done: 0, total: rows.length });

    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK).map(({ id: _id, ...row }) => row);
        const res = await fetch("/api/transactions/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: chunk }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Batch ${Math.floor(i / CHUNK) + 1} gagal.`);
        const s = json.summary as BulkSummary;
        combined.created += s.created || 0;
        combined.failed += s.failed || 0;
        combined.usersCreated = (combined.usersCreated || 0) + (s.usersCreated || 0);
        combined.usersUpdated = (combined.usersUpdated || 0) + (s.usersUpdated || 0);
        combined.errors?.push(...(s.errors || []).map((item) => ({ row: item.row + i, message: item.message })));
        setProgress({ done: Math.min(i + CHUNK, rows.length), total: rows.length });
      }
      setSummary(combined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Input massal gagal diproses.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Topbar title="Input Customer Massal" subtitle="Tambah banyak customer + transaksi manual sekaligus" />
      <div className="p-4 md:p-6 lg:p-8 max-w-[1500px] mx-auto space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <button onClick={() => router.push("/transactions")} className="text-sm text-[#818cf8] hover:text-[#a5b4fc] inline-flex items-center gap-1 mb-2">
              <ArrowLeft size={14} /> Kembali ke Transaksi
            </button>
            <h1 className="text-xl md:text-2xl font-bold text-[var(--text-primary)]">Input Massal</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">Tempel dari Excel/Google Sheets, upload file, atau isi tabel langsung.</p>
          </div>
          <button onClick={downloadTemplate} className="btn-secondary inline-flex items-center gap-2">
            <Download size={15} /> Download Template
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5 items-start">
          <div className="space-y-5">
            <div className="card p-4 space-y-4">
              <div>
                <h2 className="font-semibold text-[var(--text-primary)]">Default untuk semua baris</h2>
                <p className="text-xs text-[var(--text-muted)] mt-1">Dipakai saat kolom di baris customer dikosongkan.</p>
              </div>

              <div>
                <label className="form-label">Produk Terkait</label>
                <select className="form-input" value={defaults.productId} onChange={(e) => {
                  const id = e.target.value;
                  const product = products.find((p) => p.id === id);
                  setDefaults((d) => ({ ...d, productId: id, productName: product?.name || "", durationDays: String(product?.duration || 30) }));
                }}>
                  <option value="">Tanpa produk terkait</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label">Nama Produk Manual</label>
                <input className="form-input" value={defaults.productName} disabled={!!defaults.productId} placeholder="CapCut Pro HP 30 Hari" onChange={(e) => setDefaults((d) => ({ ...d, productName: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Sumber</label>
                  <select className="form-input" value={defaults.source} onChange={(e) => setDefaults((d) => ({ ...d, source: e.target.value }))}>
                    {SOURCES.map((source) => <option key={source}>{source}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Durasi</label>
                  <input type="number" min="1" className="form-input" value={defaults.durationDays} onChange={(e) => setDefaults((d) => ({ ...d, durationDays: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Tanggal Aktif</label>
                  <input type="date" className="form-input" style={{ colorScheme: "dark" }} value={defaults.activeDate} onChange={(e) => setDefaults((d) => ({ ...d, activeDate: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Nominal Default</label>
                  <input type="number" min="0" className="form-input" placeholder="25000" value={defaults.amount} onChange={(e) => setDefaults((d) => ({ ...d, amount: e.target.value }))} />
                </div>
              </div>

              <button onClick={applyDefaultsToBlankRows} className="btn-secondary w-full justify-center">Terapkan ke kolom kosong</button>
            </div>

            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={17} className="text-[#818cf8]" />
                <h2 className="font-semibold text-[var(--text-primary)]">Tempel / Upload</h2>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">Urutan tanpa header: <b>Nama, Email, WhatsApp, Nominal, Produk, Sumber, Tanggal Aktif, Durasi</b>. Bisa paste langsung dari Excel.</p>
              <textarea className="form-input min-h-32" value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"Budi\tbudi@gmail.com\t081234567890\t25000\nAni\tani@gmail.com\t081298765432\t25000"} />
              <button onClick={parsePaste} className="btn-primary w-full justify-center"><Users size={14} /> Baca Data Tempelan</button>

              <div className="relative py-1"><div className="border-t border-white/10" /><span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 text-[10px] text-[var(--text-muted)] bg-[var(--bg-card)]">atau</span></div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); }} />
              <button onClick={() => fileRef.current?.click()} className="btn-secondary w-full justify-center"><Upload size={14} /> Upload CSV / Excel</button>
            </div>

            <div className="p-3 rounded-xl text-xs leading-relaxed" style={{ background: "rgba(99,102,241,.07)", border: "1px solid rgba(99,102,241,.18)", color: "var(--text-secondary)" }}>
              <b className="text-[#a5b4fc]">Catatan:</b> input massal hanya menyimpan customer dan transaksi. Sistem <b>tidak mengirim akun CapCut otomatis</b> ke banyak customer untuk mencegah salah kirim.
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="p-4 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-[var(--text-primary)]">Preview Data</h2>
                <p className="text-xs text-[var(--text-muted)] mt-1"><span className="text-emerald-400 font-semibold">{validCount} valid</span>{invalidCount > 0 && <span className="text-rose-400 font-semibold"> · {invalidCount} perlu diperbaiki</span>} · {rows.length} total</p>
              </div>
              <button onClick={() => setRows((r) => [...r, newRow({ amount: defaults.amount, productName: defaults.productName, productId: defaults.productId, source: defaults.source, activeDate: defaults.activeDate, durationDays: defaults.durationDays })])} className="btn-secondary inline-flex items-center gap-1"><Plus size={14} /> Tambah Baris</button>
            </div>

            <div className="overflow-auto max-h-[620px]">
              <table className="min-w-[1180px] w-full text-xs">
                <thead className="sticky top-0 z-10 bg-[var(--bg-card)]">
                  <tr className="border-b border-white/5 text-[var(--text-muted)]">
                    <th className="p-2 text-left w-10">#</th>
                    <th className="p-2 text-left min-w-160">Nama *</th>
                    <th className="p-2 text-left min-w-190">Email *</th>
                    <th className="p-2 text-left min-w-150">WhatsApp *</th>
                    <th className="p-2 text-left min-w-110">Nominal</th>
                    <th className="p-2 text-left min-w-220">Produk</th>
                    <th className="p-2 text-left min-w-120">Sumber</th>
                    <th className="p-2 text-left min-w-135">Tanggal</th>
                    <th className="p-2 text-left min-w-90">Durasi</th>
                    <th className="p-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const rowErrors = validation[index];
                    const invalid = rowErrors.length > 0;
                    return (
                      <tr key={row.id} className="border-b border-white/5 align-top" style={{ background: invalid ? "rgba(239,68,68,.025)" : undefined }}>
                        <td className="p-2 text-[var(--text-muted)]">{index + 1}</td>
                        <td className="p-1.5"><input className="form-input !py-2 !px-2" value={row.name} onChange={(e) => updateRow(row.id, { name: e.target.value })} /></td>
                        <td className="p-1.5"><input type="email" className="form-input !py-2 !px-2" value={row.email} onChange={(e) => updateRow(row.id, { email: e.target.value.toLowerCase() })} /></td>
                        <td className="p-1.5"><input className="form-input !py-2 !px-2" value={row.whatsapp} onChange={(e) => updateRow(row.id, { whatsapp: cleanPhone(e.target.value) })} /></td>
                        <td className="p-1.5"><input type="number" min="0" className="form-input !py-2 !px-2" value={row.amount} onChange={(e) => updateRow(row.id, { amount: e.target.value })} /></td>
                        <td className="p-1.5"><input className="form-input !py-2 !px-2" value={row.productName} onChange={(e) => updateRow(row.id, { productName: e.target.value, productId: "" })} placeholder="CapCut Pro" /></td>
                        <td className="p-1.5"><select className="form-input !py-2 !px-2" value={row.source} onChange={(e) => updateRow(row.id, { source: e.target.value })}>{SOURCES.map((source) => <option key={source}>{source}</option>)}</select></td>
                        <td className="p-1.5"><input type="date" style={{ colorScheme: "dark" }} className="form-input !py-2 !px-2" value={row.activeDate} onChange={(e) => updateRow(row.id, { activeDate: e.target.value })} /></td>
                        <td className="p-1.5"><input type="number" min="1" className="form-input !py-2 !px-2" value={row.durationDays} onChange={(e) => updateRow(row.id, { durationDays: e.target.value })} /></td>
                        <td className="p-2">
                          <button onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} className="text-rose-400 hover:text-rose-300" title="Hapus baris"><Trash2 size={14} /></button>
                          {invalid && <div className="mt-2 text-[9px] text-rose-400" title={`Kurang: ${rowErrors.join(", ")}`}><X size={11} /></div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {(error || summary) && (
              <div className="p-4 border-t border-white/5">
                {error && <div className="p-3 rounded-xl text-sm text-rose-300" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.18)" }}>{error}</div>}
                {summary && (
                  <div className="p-4 rounded-xl" style={{ background: "rgba(34,197,94,.07)", border: "1px solid rgba(34,197,94,.2)" }}>
                    <p className="font-semibold text-emerald-300 flex items-center gap-2"><CheckCircle size={16} /> Input massal selesai</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-center">
                      <div><p className="text-lg font-bold text-white">{summary.created}</p><p className="text-[10px] text-[var(--text-muted)]">Transaksi dibuat</p></div>
                      <div><p className="text-lg font-bold text-white">{summary.usersCreated || 0}</p><p className="text-[10px] text-[var(--text-muted)]">Customer baru</p></div>
                      <div><p className="text-lg font-bold text-white">{summary.usersUpdated || 0}</p><p className="text-[10px] text-[var(--text-muted)]">Customer diperbarui</p></div>
                      <div><p className="text-lg font-bold text-white">{summary.failed}</p><p className="text-[10px] text-[var(--text-muted)]">Gagal</p></div>
                    </div>
                    <button onClick={() => router.push("/transactions")} className="btn-success mt-4 w-full justify-center"><Check size={14} /> Lihat Hasil di Transaksi</button>
                  </div>
                )}
              </div>
            )}

            <div className="p-4 border-t border-white/5 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
              <p className="text-xs text-[var(--text-muted)]">Maksimal 500 baris dari halaman ini, diproses per 50 baris.</p>
              <button onClick={submitBulk} disabled={submitting || validCount === 0 || invalidCount > 0} className="btn-success inline-flex justify-center items-center gap-2 min-w-52 disabled:opacity-50">
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {submitting ? `Menyimpan ${progress.done}/${progress.total}...` : `Simpan ${validCount} Transaksi`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
