"use client";

import { useState, useEffect, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { usePrivacy } from "@/context/PrivacyContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  Search,
  ShieldCheck,
  AlertTriangle,
  X,
  Check,
  ArrowRight,
  Loader2,
  LayoutList,
  LayoutGrid,
  MessageCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface WarrantyItem {
  id: string;
  claimReason: string | null;
  evidenceUrl: string | null;
  status: string | null;
  createdAt: string | null;
  oldAccount: { accountEmail: string } | null;
  oldAccountId: string | null;
  newAccount: { accountEmail: string; accountPassword: string } | null;
  transaction: {
    id: string;
    lynkIdRef: string | null;
    stockAccount: { productId: string | null } | null;
    user: { name: string; whatsapp: string | null } | null;
    purchaseDate: string | null;
    warrantyExpiredAt: string | null;
  } | null;
}

function getClaimBadge(status: string | null) {
  switch (status) {
    case "resolved": return <span className="badge badge-success">Selesai</span>;
    case "pending": return <span className="badge badge-warning">Pending</span>;
    case "rejected": return <span className="badge badge-danger">Ditolak</span>;
    default: return <span className="badge badge-neutral">{status}</span>;
  }
}

function formatWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.substring(1);
  }
  if (!cleaned.startsWith("62")) {
    cleaned = "62" + cleaned;
  }
  return cleaned;
}

export default function WarrantyDashboardPage() {
  const { maskPhone } = usePrivacy();
  const [claims, setClaims] = useState<WarrantyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [claimForm, setClaimForm] = useState({ transactionId: "", claimReason: "" });
  const [claimResult, setClaimResult] = useState<{ newAccount?: { email: string; password: string }; message?: string } | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

  // State untuk action approve/reject
  const [actionLoading, setActionLoading] = useState<string | null>(null); // claimId yang sedang diproses
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ claim: WarrantyItem; action: "approve" | "reject" } | null>(null);
  const [actionResult, setActionResult] = useState<{ success: boolean; message: string; newAccount?: { email: string; password: string } } | null>(null);
  const [availableAccounts, setAvailableAccounts] = useState<any[]>([]);
  const [selectedNewAccountId, setSelectedNewAccountId] = useState<string>("");
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<WarrantyItem['transaction']>(null);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    fetch(`/api/warranty?${params}`)
      .then((res) => res.json())
      .then((json) => { setClaims(json.claims || []); setTotal(json.total || 0); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleClaim() {
    if (!claimForm.transactionId) return;
    setSubmitting(true);
    setClaimResult(null);
    try {
      const res = await fetch("/api/warranty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(claimForm),
      });
      const json = await res.json();
      if (res.ok) {
        setClaimResult({ newAccount: json.newAccount, message: json.message });
        fetchData();
      } else {
        setClaimResult({ message: json.error });
      }
    } catch { setClaimResult({ message: "Koneksi error" }); }
    setSubmitting(false);
  }

  function closeModal() {
    setShowClaimModal(false);
    setClaimForm({ transactionId: "", claimReason: "" });
    setClaimResult(null);
  }

  // Buka confirmation modal untuk approve/reject
  function openActionModal(claim: WarrantyItem, action: "approve" | "reject") {
    setActionTarget({ claim, action });
    setActionResult(null);
    setSelectedNewAccountId("");
    setShowActionModal(true);

    if (action === "approve" && claim.transaction?.stockAccount?.productId) {
      fetchAvailableAccounts(claim.transaction.stockAccount.productId, claim.oldAccountId || "");
    }
  }

  async function fetchAvailableAccounts(productId: string, excludeId: string) {
    setLoadingAccounts(true);
    try {
      const res = await fetch(`/api/warranty/available-stock?productId=${productId}&excludeAccountId=${excludeId}`);
      const json = await res.json();
      setAvailableAccounts(json.accounts || []);
      if (json.accounts?.length > 0) {
        setSelectedNewAccountId(json.accounts[0].id);
      }
    } catch (err) {
      console.error("Error fetching available accounts:", err);
    } finally {
      setLoadingAccounts(false);
    }
  }

  function closeActionModal() {
    setShowActionModal(false);
    setActionTarget(null);
    setActionResult(null);
  }

  // Handle approve / reject via PATCH
  async function handleAction() {
    if (!actionTarget) return;
    setActionLoading(actionTarget.claim.id);
    setActionResult(null);
    try {
      const res = await fetch("/api/warranty", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimId: actionTarget.claim.id,
          action: actionTarget.action,
          newAccountId: actionTarget.action === "approve" ? selectedNewAccountId : undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setActionResult({
          success: true,
          message: json.message,
          newAccount: json.newAccount,
        });
        fetchData();
      } else {
        setActionResult({ success: false, message: json.error });
      }
    } catch {
      setActionResult({ success: false, message: "Koneksi error" });
    }
    setActionLoading(null);
  }

  // Buka WhatsApp
  function openWhatsApp(claim: WarrantyItem) {
    const phone = claim.transaction?.user?.whatsapp;
    const customerName = claim.transaction?.user?.name || "Pelanggan";
    const waNumber = formatWhatsAppNumber(phone);

    if (!waNumber) {
      alert("Nomor WhatsApp tidak tersedia untuk pelanggan ini.");
      return;
    }

    let statusText = "SEDANG DIPROSES";
    if (claim.status === "resolved") statusText = "DISETUJUI";
    else if (claim.status === "rejected") statusText = "DITOLAK";

    let message = `Halo ${customerName}, kami dari Dorriz Store ingin menginformasikan terkait pengajuan garansi Anda.\n\n`;
    message += `ID Transaksi: *${claim.transaction?.lynkIdRef || claim.transaction?.id || "-"}*\n`;
    message += `Status: *${statusText}*\n`;

    if (claim.status === "resolved" && claim.newAccount) {
      message += `\nBerikut adalah data akun baru Anda:\n`;
      message += `📧 Email: ${claim.newAccount.accountEmail}\n`;
      message += `🔑 Password: ${claim.newAccount.accountPassword}\n\n`;
      message += `Silakan login kembali dan pastikan data sudah sesuai. Terima kasih!`;
    } else if (claim.status === "rejected") {
      message += `\nMohon maaf, pengajuan garansi Anda belum dapat kami setujui. Jika ada pertanyaan lebih lanjut, silakan hubungi kami kembali.`;
    } else {
      message += `\nMohon ditunggu ya kak, tim kami sedang memproses pengajuan Anda.`;
    }

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${waNumber}?text=${encodedMessage}`, "_blank");
  }

  // Render action buttons for pending claims
  function renderActionButtons(claim: WarrantyItem, isCard = false) {
    const isLoading = actionLoading === claim.id;

    function openTransactionModal(transaction: WarrantyItem['transaction']) {
      setSelectedTransaction(transaction);
      setShowTransactionModal(true);
    }

    if (claim.status === "pending") {
      return (
        <div className={`flex ${isCard ? 'flex-col' : 'flex-row'} gap-1.5`}>
          <button
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 disabled:opacity-50"
            onClick={() => openActionModal(claim, "approve")}
            title="Terima pengajuan garansi"
          >
            <CheckCircle2 size={13} /> Terima
          </button>
          <button
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-1 bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white border border-rose-500/20 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 disabled:opacity-50"
            onClick={() => openActionModal(claim, "reject")}
            title="Tolak pengajuan garansi"
          >
            <XCircle size={13} /> Tolak
          </button>
          <button
            className="inline-flex items-center justify-center gap-1 bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white border border-teal-500/20 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200"
            onClick={() => openWhatsApp(claim)}
            title="Chat WhatsApp"
          >
            <MessageCircle size={13} /> WA
          </button>
        </div>
      );
    }

    // Untuk status non-pending, hanya tampilkan tombol WhatsApp
    return (
      <button
        className="inline-flex items-center justify-center gap-1 bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white border border-teal-500/20 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200"
        onClick={() => openWhatsApp(claim)}
        title="Chat WhatsApp"
      >
        <MessageCircle size={13} /> WA
      </button>
    );
  }

  return (
    <>
      <Topbar title="Klaim Garansi" subtitle="Kelola klaim garansi dan penggantian akun pelanggan" />

      <div className="px-4 md:px-8 pb-8 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="search-box flex-1 max-w-md">
            <Search size={16} className="search-icon" />
            <input type="text" placeholder="Cari nama, ID transaksi, atau nomor WA..." className="form-input !pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={() => setShowClaimModal(true)}>
            <ShieldCheck size={16} /> Proses Klaim Baru
          </button>
        </div>

        {/* View Toggle mobile */}
        <div className="flex items-center justify-between lg:hidden">
          <p className="text-xs text-[var(--text-muted)]">Total {total} klaim</p>
          <div className="flex gap-1">
            <button className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}><LayoutList size={13} /> Tabel</button>
            <button className={`view-toggle-btn ${viewMode === 'card' ? 'active' : ''}`} onClick={() => setViewMode('card')}><LayoutGrid size={13} /> Card</button>
          </div>
        </div>

        <div className="glass-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-[#818cf8]" /><span className="ml-2 text-[var(--text-secondary)]">Memuat...</span></div>
          ) : (
            <>
              {viewMode === 'table' && (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead><tr>
                      <th>Transaksi</th>
                      <th>Pelanggan</th>
                      <th>Akun Lama → Baru</th>
                      <th>Alasan</th>
                      <th>Bukti</th>
                      <th>Tanggal</th>
                      <th className="sticky-col-head">Status</th>
                      <th>Aksi</th>
                    </tr></thead>
                    <tbody>
                      {claims.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-8 text-[var(--text-muted)]">Belum ada klaim garansi</td></tr>
                      ) : claims.map((claim) => (
                        <tr key={claim.id}>
                          <td className="font-mono text-sm">
                            <button 
                              onClick={() => {
                                setSelectedTransaction(claim.transaction);
                                setShowTransactionModal(true);
                              }}
                              className="text-[#818cf8] hover:underline transition-all"
                            >
                              {claim.transaction?.lynkIdRef || claim.transaction?.id || "-"}
                            </button>
                          </td>
                          <td><p className="font-medium">{claim.transaction?.user?.name || "-"}</p><p className="text-xs text-[var(--text-muted)]">{maskPhone(claim.transaction?.user?.whatsapp)}</p></td>
                          <td>
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className="text-rose-400 font-mono">{claim.oldAccount?.accountEmail || "—"}</span>
                              <ArrowRight size={12} className="text-[var(--text-muted)] flex-shrink-0" />
                              <span className="text-emerald-400 font-mono">{claim.newAccount?.accountEmail || "—"}</span>
                            </div>
                          </td>
                           <td 
                             className={`text-[var(--text-secondary)] text-sm max-w-[160px] truncate ${claim.claimReason ? 'cursor-pointer hover:text-[#818cf8] transition-colors' : ''}`}
                             onClick={() => {
                               if (claim.claimReason) {
                                 setSelectedReason(claim.claimReason);
                                 setShowReasonModal(true);
                               }
                             }}
                             title={claim.claimReason ? "Klik untuk melihat alasan lengkap" : undefined}
                           >
                             {claim.claimReason || "-"}
                           </td>
                          <td>
                            {claim.evidenceUrl ? (
                              <a href={claim.evidenceUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-xs flex items-center gap-1">
                                <Search size={12} /> Lihat Foto
                              </a>
                            ) : (
                              <span className="text-xs text-[var(--text-muted)]">-</span>
                            )}
                          </td>
                          <td className="text-[var(--text-secondary)] text-sm">{claim.createdAt ? new Date(claim.createdAt).toLocaleDateString("id-ID") : "-"}</td>
                          <td className="sticky-col-body">{getClaimBadge(claim.status)}</td>
                          <td>
                            {renderActionButtons(claim)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {viewMode === 'card' && (
                <div className="data-card-grid">
                  {claims.length === 0 ? <p className="text-center py-8 text-[var(--text-muted)]">Belum ada klaim garansi</p> : claims.map((claim) => (
                    <div key={claim.id} className="data-card">
                      <div className="flex items-start justify-between mb-3">
                        <div className="min-w-0 flex-1 mr-2">
                          <p className="font-semibold text-[var(--text-primary)] text-sm truncate">{claim.transaction?.user?.name || "-"}</p>
                          <p className="text-xs text-[var(--text-muted)]">{maskPhone(claim.transaction?.user?.whatsapp)}</p>
                        </div>
                        {getClaimBadge(claim.status)}
                      </div>
                      <div className="space-y-1.5 pt-2.5 border-t border-[rgba(99,102,241,0.08)]">
                        <div className="data-card-row"><span className="data-card-label">ID Transaksi</span>
                          <button 
                            onClick={() => {
                              setSelectedTransaction(claim.transaction);
                              setShowTransactionModal(true);
                            }}
                            className="data-card-value font-mono text-xs text-[#818cf8] hover:underline"
                          >
                            {claim.transaction?.lynkIdRef || claim.transaction?.id?.substring(0, 8) || "-"}
                          </button>
                        </div>
                        <div className="data-card-row"><span className="data-card-label">Akun Lama</span><span className="data-card-value font-mono text-xs text-rose-400">{claim.oldAccount?.accountEmail || "—"}</span></div>
                        <div className="data-card-row"><span className="data-card-label">Akun Baru</span><span className="data-card-value font-mono text-xs text-emerald-400">{claim.newAccount?.accountEmail || "—"}</span></div>
                        <div className="data-card-row">
                          <span className="data-card-label">Alasan</span>
                          <span 
                            className={`data-card-value max-w-[200px] truncate ${claim.claimReason ? 'cursor-pointer hover:text-[#818cf8] transition-colors' : ''}`}
                            onClick={() => {
                              if (claim.claimReason) {
                                setSelectedReason(claim.claimReason);
                                setShowReasonModal(true);
                              }
                            }}
                            title={claim.claimReason ? "Klik untuk melihat alasan lengkap" : undefined}
                          >
                            {claim.claimReason || "-"}
                          </span>
                        </div>
                        <div className="data-card-row"><span className="data-card-label">Bukti Foto</span><span className="data-card-value">
                          {claim.evidenceUrl ? <a href={claim.evidenceUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-xs flex items-center gap-1"><Search size={12} /> Buka Foto</a> : "-"}
                        </span></div>
                        <div className="data-card-row"><span className="data-card-label">Tanggal</span><span className="data-card-value">{claim.createdAt ? new Date(claim.createdAt).toLocaleDateString("id-ID") : "-"}</span></div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-[rgba(99,102,241,0.08)]">
                        {renderActionButtons(claim, true)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="px-4 md:px-6 py-4 border-t border-[rgba(99,102,241,0.08)]">
                <p className="text-sm text-[var(--text-muted)]">Total {total} klaim garansi</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal Klaim Baru */}
      {showClaimModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="font-semibold text-[var(--text-primary)] text-lg flex items-center gap-2"><ShieldCheck size={20} className="text-[#818cf8]" /> Proses Klaim Garansi</h3>
              <button className="btn-icon" onClick={closeModal}><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              {claimResult?.newAccount ? (
                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-3">
                  <p className="font-semibold text-emerald-300">✅ {claimResult.message}</p>
                  <div className="bg-[var(--bg-primary)] rounded-lg p-3 font-mono text-sm space-y-1">
                    <p><span className="text-[var(--text-muted)]">Email Baru:</span> <span className="text-[var(--text-primary)]">{claimResult.newAccount.email}</span></p>
                    <p><span className="text-[var(--text-muted)]">Password:</span> <span className="text-[var(--text-primary)]">{claimResult.newAccount.password}</span></p>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">Slot akun lama sudah dikurangi. Kirim data akun baru ke pelanggan.</p>
                </div>
              ) : (
                <>
                  <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={18} className="text-amber-400 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-300">Perhatian</p>
                        <p className="text-[var(--text-secondary)] mt-1">Proses ini akan otomatis mengambil 1 stok akun baru, mengurangi slot akun lama, dan menyiapkan akun baru untuk dikirim ke pelanggan. Satu transaksi dapat diklaim lebih dari 1 kali.</p>
                      </div>
                    </div>
                  </div>
                  <div><label className="form-label">ID Transaksi (UUID)</label><input type="text" className="form-input" placeholder="Paste UUID transaksi dari tabel" value={claimForm.transactionId} onChange={(e) => setClaimForm({ ...claimForm, transactionId: e.target.value })} /></div>
                  <div>
                    <label className="form-label">Alasan Klaim</label>
                    <select className="form-input" value={claimForm.claimReason} onChange={(e) => setClaimForm({ ...claimForm, claimReason: e.target.value })}>
                      <option value="">-- Pilih Alasan --</option>
                      <option value="Batas Limit Perangkat">Batas Limit Perangkat</option>
                      <option value="Akun Tidak Bisa Login">Akun Tidak Bisa Login</option>
                      <option value="Fitur Pro Tidak Aktif">Fitur Pro Tidak Aktif</option>
                      <option value="Lainnya">Lainnya</option>
                    </select>
                  </div>
                  {claimResult?.message && <p className="text-sm text-rose-400">{claimResult.message}</p>}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeModal}>Tutup</button>
              {!claimResult?.newAccount && (
                <button className="btn-success" onClick={handleClaim} disabled={submitting}>
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Proses & Ganti Akun
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Terima / Tolak */}
      {showActionModal && actionTarget && (
        <div className="modal-overlay" onClick={closeActionModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="font-semibold text-[var(--text-primary)] text-lg flex items-center gap-2">
                {actionTarget.action === "approve" ? (
                  <><CheckCircle2 size={20} className="text-emerald-400" /> Terima Pengajuan Garansi</>
                ) : (
                  <><XCircle size={20} className="text-rose-400" /> Tolak Pengajuan Garansi</>
                )}
              </h3>
              <button className="btn-icon" onClick={closeActionModal}><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              {actionResult ? (
                <div className={`p-4 rounded-xl border ${actionResult.success ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'} space-y-3`}>
                  <p className={`font-semibold ${actionResult.success ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {actionResult.success ? '✅' : '❌'} {actionResult.message}
                  </p>
                  {actionResult.newAccount && (
                    <div className="bg-[var(--bg-primary)] rounded-lg p-3 font-mono text-sm space-y-1">
                      <p><span className="text-[var(--text-muted)]">Email Baru:</span> <span className="text-[var(--text-primary)]">{actionResult.newAccount.email}</span></p>
                      <p><span className="text-[var(--text-muted)]">Password:</span> <span className="text-[var(--text-primary)]">{actionResult.newAccount.password}</span></p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Info klaim */}
                  <div className="bg-[var(--bg-primary)] rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-muted)]">Pelanggan</span>
                      <span className="text-[var(--text-primary)] font-medium">{actionTarget.claim.transaction?.user?.name || "-"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-muted)]">WhatsApp</span>
                      <span className="text-[var(--text-primary)]">{actionTarget.claim.transaction?.user?.whatsapp || "-"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-muted)]">Alasan</span>
                      <span className="text-[var(--text-primary)]">{actionTarget.claim.claimReason || "-"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-muted)]">Bukti</span>
                      <span>
                        {actionTarget.claim.evidenceUrl ? (
                          <a href={actionTarget.claim.evidenceUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-xs flex items-center gap-1">
                            <Search size={12} /> Lihat Bukti
                          </a>
                        ) : (
                          <span className="text-[var(--text-muted)]">Tidak ada</span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-muted)]">Tanggal Klaim</span>
                      <span className="text-[var(--text-primary)]">{actionTarget.claim.createdAt ? new Date(actionTarget.claim.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-"}</span>
                    </div>
                  </div>

                  {/* Selection for Approve */}
                  {actionTarget.action === "approve" && (
                    <div className="space-y-2">
                      <label className="form-label">Pilih Akun Pengganti</label>
                      {loadingAccounts ? (
                        <div className="flex items-center gap-2 text-sm text-(--text-muted)">
                          <Loader2 size={14} className="animate-spin" /> Memuat stok tersedia...
                        </div>
                      ) : availableAccounts.length === 0 ? (
                        <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/5 text-xs text-rose-400">
                          ⚠️ Stok akun untuk produk ini habis! Silakan tambah stok terlebih dahulu.
                        </div>
                      ) : (
                        <select
                          className="form-input"
                          value={selectedNewAccountId}
                          onChange={(e) => setSelectedNewAccountId(e.target.value)}
                        >
                          {availableAccounts.map(acc => (
                            <option key={acc.id} value={acc.id}>
                              {acc.accountEmail} ({acc.usedSlots}/{acc.maxSlots}) slot (dibuat: {acc.createdAt ? new Date(acc.createdAt).toLocaleDateString("id-ID", { day: 'numeric', month: 'short' }) : "-"})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Warning */}
                  <div className={`p-3 rounded-xl border ${actionTarget.action === "approve" ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle size={16} className={actionTarget.action === "approve" ? "text-emerald-400 mt-0.5" : "text-rose-400 mt-0.5"} />
                      <p className="text-sm text-[var(--text-secondary)]">
                        {actionTarget.action === "approve"
                          ? "Menerima klaim akan mengalokasikan akun yang Anda pilih sebagai pengganti, mengurangi slot akun lama, dan menyiapkan data akun baru untuk pelanggan."
                          : "Menolak klaim akan mengubah status klaim menjadi \"Ditolak\". Pelanggan tidak akan mendapatkan akun pengganti."}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeActionModal}>
                {actionResult ? "Tutup" : "Batal"}
              </button>
              {!actionResult && (
                <button
                  className={actionTarget.action === "approve" ? "btn-success" : "btn-danger"}
                  onClick={handleAction}
                  disabled={actionLoading === actionTarget.claim.id || (actionTarget.action === "approve" && !selectedNewAccountId)}
                >
                  {actionLoading === actionTarget.claim.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : actionTarget.action === "approve" ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <XCircle size={16} />
                  )}
                  {actionTarget.action === "approve" ? "Ya, Terima Klaim" : "Ya, Tolak Klaim"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Modal Detail Transaksi */}
      {showTransactionModal && selectedTransaction && (
        <div className="modal-overlay" onClick={() => setShowTransactionModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h3 className="font-semibold text-[var(--text-primary)] text-lg flex items-center gap-2">
                <LayoutList size={20} className="text-[#818cf8]" /> Detail Transaksi
              </h3>
              <button className="btn-icon" onClick={() => setShowTransactionModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body space-y-5">
              <div className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[rgba(99,102,241,0.1)] space-y-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--text-muted)]">ID Transaksi</span>
                  <span className="text-sm font-mono text-[#818cf8] break-all">{selectedTransaction.id}</span>
                  {selectedTransaction.lynkIdRef && (
                    <span className="text-xs text-indigo-400">Ref: {selectedTransaction.lynkIdRef}</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[rgba(255,255,255,0.05)]">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-[var(--text-muted)]">Tanggal Order</span>
                    <span className="text-sm text-[var(--text-primary)]">
                      {selectedTransaction.purchaseDate 
                        ? new Date(selectedTransaction.purchaseDate).toLocaleDateString("id-ID", {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : "-"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-[var(--text-muted)]">Sisa Masa Aktif</span>
                    <span className="text-sm font-semibold text-emerald-400">
                      {(() => {
                        if (!selectedTransaction.warrantyExpiredAt) return "-";
                        const expiry = new Date(selectedTransaction.warrantyExpiredAt);
                        const now = new Date();
                        const diffTime = expiry.getTime() - now.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        
                        if (diffDays < 0) return "Expired";
                        return `${diffDays} Hari Lagi`;
                      })()}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 pt-2 border-t border-[rgba(255,255,255,0.05)]">
                  <span className="text-xs text-[var(--text-muted)]">Garansi Berakhir</span>
                  <span className="text-sm text-rose-400">
                    {selectedTransaction.warrantyExpiredAt 
                      ? new Date(selectedTransaction.warrantyExpiredAt).toLocaleDateString("id-ID", {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })
                      : "-"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-[var(--text-muted)] px-1">Data Pelanggan</p>
                <div className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[rgba(99,102,241,0.1)] space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Nama</span>
                    <span className="text-[var(--text-primary)] font-medium">{selectedTransaction.user?.name || "-"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">WhatsApp</span>
                    <span className="text-[var(--text-primary)]">{selectedTransaction.user?.whatsapp || "-"}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary w-full" onClick={() => setShowTransactionModal(false)}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail Alasan Klaim */}
      {showReasonModal && selectedReason && (
        <div className="modal-overlay" onClick={() => { setShowReasonModal(false); setSelectedReason(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h3 className="font-semibold text-[var(--text-primary)] text-lg flex items-center gap-2">
                <AlertTriangle size={20} className="text-amber-400" /> Detail Alasan Klaim
              </h3>
              <button className="btn-icon" onClick={() => { setShowReasonModal(false); setSelectedReason(null); }}><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[rgba(255,255,255,0.05)] space-y-2">
                <span className="text-xs text-[var(--text-muted)]">Alasan Lengkap</span>
                <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words leading-relaxed">
                  {selectedReason}
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary w-full" onClick={() => { setShowReasonModal(false); setSelectedReason(null); }}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </>

  );
}
