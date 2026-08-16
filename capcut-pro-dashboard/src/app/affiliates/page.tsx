"use client";

import { useCallback, useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { usePrivacy } from "@/context/PrivacyContext";
import { ArrowDownCircle, Check, Copy, Gift, Link2, Loader2, Minus, Plus, RefreshCw, Search, UserPlus, Users, Wallet, X, XCircle } from "lucide-react";

interface Member {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  status: string | null;
  createdAt: string;
  availablePoints: number;
  pendingPoints: number;
  availableRupiah: number;
  _count: { referredUsers: number; commissions: number; withdrawals: number };
}

interface Withdrawal {
  id: string;
  points: number | null;
  amount: number;
  method: string | null;
  accountNumber: string | null;
  accountName: string | null;
  payoutReference: string | null;
  status: string | null;
  notes: string | null;
  createdAt: string;
  affiliate: { id: string; name: string; email: string | null; whatsapp: string | null } | null;
}

export default function LoyaltyAdminPage() {
  const { maskEmail, maskPhone } = usePrivacy();
  const [members, setMembers] = useState<Member[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdjust, setShowAdjust] = useState<Member | null>(null);
  const [createData, setCreateData] = useState({ name: "", email: "", whatsapp: "" });
  const [adjustData, setAdjustData] = useState({ points: "", note: "" });
  const [inviteLink, setInviteLink] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fmt = (value: number) => new Intl.NumberFormat("id-ID").format(value);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const [memberResponse, withdrawalResponse] = await Promise.all([
        fetch(`/api/affiliates${params}`),
        fetch("/api/affiliates/withdrawals?status=pending"),
      ]);
      const memberData = await memberResponse.json();
      const withdrawalData = await withdrawalResponse.json();
      setMembers(memberData.affiliates || []);
      setWithdrawals(withdrawalData.withdrawals || []);
    } finally {
      setLoading(false);
    }
  }, [search]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh(); }, [refresh]);

  const createMember = async () => {
    if (!createData.name.trim()) return;
    setSubmitting(true);
    const response = await fetch("/api/affiliates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createData) });
    const data = await response.json();
    setSubmitting(false);
    if (!response.ok) { setNotice(data.error || "Gagal membuat member"); return; }
    setShowCreate(false);
    setCreateData({ name: "", email: "", whatsapp: "" });
    setNotice("Member berhasil dibuat. Generate link referral dari tabel member.");
    refresh();
  };

  const generateInvite = async (memberId: string) => {
    const response = await fetch(`/api/affiliates/${memberId}/invite`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) { setNotice(data.error || "Gagal membuat link referral"); return; }
    const link = data.referralUrl || data.inviteUrl || "";
    setInviteLink(link);
    if (link) await navigator.clipboard.writeText(link);
    setNotice("Link referral berhasil dibuat dan disalin.");
  };

  const adjustPoints = async () => {
    if (!showAdjust || !adjustData.points || !adjustData.note.trim()) return;
    setSubmitting(true);
    const response = await fetch(`/api/affiliates/${showAdjust.id}/points`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: Number(adjustData.points), note: adjustData.note }) });
    const data = await response.json();
    setSubmitting(false);
    if (!response.ok) { setNotice(data.error || "Gagal mengubah poin"); return; }
    setShowAdjust(null);
    setAdjustData({ points: "", note: "" });
    setNotice("Koreksi poin berhasil disimpan.");
    refresh();
  };

  const updateWithdrawal = async (id: string, status: "approved" | "paid" | "rejected") => {
    const payoutReference = status === "paid" ? window.prompt("Masukkan nomor referensi/bukti pembayaran (opsional):") || "" : "";
    const notes = status === "rejected" ? window.prompt("Alasan penolakan:") || "" : "";
    const response = await fetch("/api/affiliates/withdrawals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status, payoutReference, notes }) });
    const data = await response.json();
    setNotice(response.ok ? `Withdraw berhasil diubah menjadi ${status}.` : (data.error || "Gagal memperbarui withdraw"));
    refresh();
  };

  const totalPoints = members.reduce((sum, member) => sum + Number(member.availablePoints || 0), 0);
  const totalReferrals = members.reduce((sum, member) => sum + Number(member._count?.referredUsers || 0), 0);

  return (
    <div>
      <Topbar title="Loyalty Member" subtitle="Kelola member, reward poin, referral, dan withdraw" />
      <div className="space-y-6 px-4 pb-8 sm:px-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="glass-card p-4"><p className="text-xs text-[var(--text-muted)]">Total Member</p><p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{members.length}</p></div>
          <div className="glass-card p-4"><p className="text-xs text-[var(--text-muted)]">Poin Available</p><p className="mt-1 text-2xl font-bold text-emerald-400">{fmt(totalPoints)}</p><p className="text-[10px] text-[var(--text-muted)]">Rp {fmt(totalPoints * 1000)}</p></div>
          <div className="glass-card p-4"><p className="text-xs text-[var(--text-muted)]">Customer Referral</p><p className="mt-1 text-2xl font-bold text-cyan-400">{fmt(totalReferrals)}</p></div>
          <div className="glass-card p-4"><p className="text-xs text-[var(--text-muted)]">Withdraw Pending</p><p className="mt-1 text-2xl font-bold text-amber-400">{withdrawals.length}</p></div>
        </div>

        {notice && <div className="flex items-center justify-between rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div>}

        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="search-box max-w-md"><Search size={16} className="search-icon" /><input className="form-input !pl-10" placeholder="Cari nama, email, atau WhatsApp" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="flex gap-2"><button className="btn-secondary gap-2" onClick={() => refresh()}><RefreshCw size={15} />Refresh</button><button className="btn-primary gap-2" onClick={() => setShowCreate(true)}><UserPlus size={15} />Tambah Member</button></div></div>

        <div className="glass-card overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4"><div><h2 className="text-sm font-semibold text-[var(--text-primary)]">Daftar Member</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Reward otomatis diberikan 3 poin setelah customer baru berhasil transaksi.</p></div><Gift size={20} className="text-emerald-400" /></div>{loading ? <div className="flex justify-center py-20"><Loader2 size={30} className="animate-spin text-emerald-400" /></div> : members.length === 0 ? <div className="py-20 text-center text-sm text-[var(--text-muted)]">Belum ada member.</div> : <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Member</th><th>Kontak</th><th>Poin</th><th>Referral</th><th>Status</th><th className="text-right">Aksi</th></tr></thead><tbody>{members.map(member => <tr key={member.id}><td><p className="font-semibold text-[var(--text-primary)]">{member.name}</p><p className="text-[10px] text-[var(--text-muted)]">{new Date(member.createdAt).toLocaleDateString("id-ID")}</p></td><td><p className="text-sm">{maskEmail(member.email)}</p><p className="text-xs text-[var(--text-muted)]">{maskPhone(member.whatsapp)}</p></td><td><p className="font-bold text-emerald-400">{fmt(member.availablePoints)} poin</p><p className="text-xs text-[var(--text-muted)]">Rp {fmt(member.availableRupiah)}</p>{member.pendingPoints > 0 && <p className="text-[10px] text-amber-400">{fmt(member.pendingPoints)} pending</p>}</td><td><span className="flex items-center gap-1 text-sm"><Users size={14} className="text-cyan-400" />{member._count?.referredUsers || 0}</span></td><td><span className={`badge ${member.status === "active" ? "badge-success" : "badge-neutral"}`}>{member.status || "-"}</span></td><td><div className="flex justify-end gap-1"><button className="btn-icon" title="Generate link referral" onClick={() => generateInvite(member.id)}><Link2 size={15} /></button><button className="btn-icon" title="Koreksi poin" onClick={() => { setShowAdjust(member); setAdjustData({ points: "", note: "" }); }}><Plus size={15} /></button></div></td></tr>)}</tbody></table></div>}</div>

        <div className="glass-card overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4"><div><h2 className="text-sm font-semibold text-[var(--text-primary)]">Pengajuan Withdraw</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Member mengajukan sendiri; admin memverifikasi dan mencatat pembayaran.</p></div><Wallet size={20} className="text-amber-400" /></div>{withdrawals.length === 0 ? <div className="py-14 text-center text-sm text-[var(--text-muted)]">Tidak ada withdraw pending.</div> : <div className="divide-y divide-[rgba(99,102,241,0.06)]">{withdrawals.map(item => <div key={item.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><p className="font-semibold text-[var(--text-primary)]">{item.affiliate?.name || "Member"} · {fmt(Number(item.points || 0))} poin / Rp {fmt(Number(item.amount || 0))}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{item.method || "-"} · {item.accountNumber || "-"} · {item.accountName || "-"}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{new Date(item.createdAt).toLocaleString("id-ID")}</p></div><div className="flex flex-wrap gap-2"><button className="btn-secondary gap-1 !px-3 !py-2 text-xs" onClick={() => updateWithdrawal(item.id, "approved")}><Check size={14} />Setujui</button><button className="btn-primary gap-1 !bg-emerald-600 !px-3 !py-2 text-xs" onClick={() => updateWithdrawal(item.id, "paid")}><ArrowDownCircle size={14} />Tandai Dibayar</button><button className="btn-secondary gap-1 !border-rose-400/30 !text-rose-300 !px-3 !py-2 text-xs" onClick={() => updateWithdrawal(item.id, "rejected")}><XCircle size={14} />Tolak</button></div></div>)}</div>}</div>
      </div>

      {inviteLink && <div className="fixed bottom-6 right-6 z-50 max-w-lg rounded-2xl border border-emerald-400/30 bg-[var(--bg-card)] p-4 shadow-2xl"><div className="flex items-start gap-3"><Link2 className="mt-0.5 shrink-0 text-emerald-400" size={18} /><div className="min-w-0"><p className="text-xs font-semibold text-emerald-300">Link referral</p><p className="mt-1 break-all text-xs text-[var(--text-secondary)]">{inviteLink}</p><button className="mt-2 flex items-center gap-1 text-xs text-emerald-400" onClick={() => navigator.clipboard.writeText(inviteLink)}><Copy size={13} />Salin ulang</button></div><button className="btn-icon shrink-0" onClick={() => setInviteLink("")}><X size={15} /></button></div></div>}

      {showCreate && <div className="modal-overlay" onClick={() => setShowCreate(false)}><div className="modal-content" style={{ maxWidth: 460 }} onClick={event => event.stopPropagation()}><div className="modal-header"><h3 className="font-semibold text-[var(--text-primary)]">Tambah Loyalty Member</h3><button className="btn-icon" onClick={() => setShowCreate(false)}><X size={17} /></button></div><div className="modal-body space-y-4"><div><label className="form-label">Nama *</label><input className="form-input" value={createData.name} onChange={event => setCreateData({ ...createData, name: event.target.value })} /></div><div><label className="form-label">Email</label><input type="email" className="form-input" value={createData.email} onChange={event => setCreateData({ ...createData, email: event.target.value })} /></div><div><label className="form-label">WhatsApp</label><input className="form-input" value={createData.whatsapp} onChange={event => setCreateData({ ...createData, whatsapp: event.target.value })} /></div></div><div className="modal-footer"><button className="btn-secondary" onClick={() => setShowCreate(false)}>Batal</button><button className="btn-primary gap-2" onClick={createMember} disabled={submitting || !createData.name.trim()}>{submitting ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}Buat Member</button></div></div></div>}

      {showAdjust && <div className="modal-overlay" onClick={() => setShowAdjust(null)}><div className="modal-content" style={{ maxWidth: 460 }} onClick={event => event.stopPropagation()}><div className="modal-header"><h3 className="font-semibold text-[var(--text-primary)]">Koreksi Poin · {showAdjust.name}</h3><button className="btn-icon" onClick={() => setShowAdjust(null)}><X size={17} /></button></div><div className="modal-body space-y-4"><div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3 text-xs text-[var(--text-secondary)]">Gunakan angka positif untuk menambah dan angka negatif untuk mengurangi poin. Alasan wajib dicatat.</div><div><label className="form-label">Jumlah poin</label><input type="number" className="form-input" placeholder="Contoh: 3 atau -3" value={adjustData.points} onChange={event => setAdjustData({ ...adjustData, points: event.target.value })} /></div><div><label className="form-label">Alasan</label><textarea className="form-input min-h-24" value={adjustData.note} onChange={event => setAdjustData({ ...adjustData, note: event.target.value })} /></div></div><div className="modal-footer"><button className="btn-secondary" onClick={() => setShowAdjust(null)}>Batal</button><button className="btn-primary gap-2" onClick={adjustPoints} disabled={submitting || !adjustData.points || !adjustData.note.trim()}>{submitting ? <Loader2 size={15} className="animate-spin" /> : <Minus size={15} />}Simpan Koreksi</button></div></div></div>}
    </div>
  );
}
