"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Ban, Loader2, MessageCircle, Reply, Send, ShieldAlert, Trash2, Undo2, VolumeX, Wifi, WifiOff, X } from "lucide-react";

type AdminMessage = {
  id: string;
  clientMessageId: string;
  senderName: string;
  isAdmin: boolean;
  memberId?: string;
  body: string;
  reply: { id: string; senderName: string; body: string; deleted: boolean } | null;
  createdAt: string;
  deleted: boolean;
};

type Restriction = {
  memberId: string;
  name: string;
  status: "muted" | "banned";
  mutedUntil: string | null;
  reason: string;
  updatedAt: string;
};

type CommunitySocket = {
  connected: boolean;
  auth: Record<string, unknown>;
  on: (event: string, callback: (...args: any[]) => void) => CommunitySocket;
  emit: (event: string, ...args: any[]) => CommunitySocket;
  connect: () => CommunitySocket;
  disconnect: () => CommunitySocket;
};

type AccessResponse = { token: string; socketUrl: string };
type HistoryResponse = { ok: boolean; messages?: AdminMessage[]; hasMore?: boolean; error?: { message?: string } };
type ActionResponse = { ok: boolean; error?: { message?: string } };

const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" });

function socketFactory() {
  return (window as unknown as { io?: (url: string, options?: Record<string, unknown>) => CommunitySocket }).io;
}

async function fetchAccess(): Promise<AccessResponse> {
  const response = await fetch("/api/admin/members/community/token", { method: "POST", cache: "no-store" });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Gagal membuka komunitas");
  return json;
}

function ensureSocketClient(socketUrl: string) {
  if (socketFactory()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-community-socket="true"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Gagal memuat koneksi realtime")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = `${socketUrl.replace(/\/$/, "")}/socket.io/socket.io.js`;
    script.async = true;
    script.dataset.communitySocket = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Gagal memuat koneksi realtime"));
    document.head.appendChild(script);
  });
}

function emitAck<T>(socket: CommunitySocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Koneksi komunitas timeout")), 12_000);
    socket.emit(event, payload, (response: T) => {
      window.clearTimeout(timer);
      resolve(response);
    });
  });
}

function cursorOf(message: AdminMessage) {
  return { id: message.id, createdAt: message.createdAt };
}

export default function AdminCommunityClient() {
  const socketRef = useRef<CommunitySocket | null>(null);
  const messagesRef = useRef<AdminMessage[]>([]);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [connection, setConnection] = useState<"connecting" | "connected" | "reconnecting" | "offline">("connecting");
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<AdminMessage | null>(null);
  const [busyKey, setBusyKey] = useState("");

  function mergeMessages(incoming: AdminMessage[]) {
    const map = new Map(messagesRef.current.map((message) => [message.id, message]));
    for (const message of incoming) map.set(message.id, { ...map.get(message.id), ...message });
    const merged = Array.from(map.values()).sort((a, b) => {
      const time = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return time || a.id.localeCompare(b.id);
    });
    messagesRef.current = merged;
    setMessages(merged);
  }

  function markDeleted(messageId: string) {
    const updated = messagesRef.current.map((message) => ({
      ...message,
      ...(message.id === messageId ? { deleted: true, body: "" } : {}),
      reply: message.reply?.id === messageId ? { ...message.reply, deleted: true, body: "" } : message.reply,
    }));
    messagesRef.current = updated;
    setMessages(updated);
  }

  async function loadRestrictions(socket = socketRef.current) {
    if (!socket?.connected) return;
    const result = await emitAck<{ ok: boolean; restrictions?: Restriction[]; error?: { message?: string } }>(socket, "restriction:list", {});
    if (!result.ok) throw new Error(result.error?.message || "Gagal memuat pembatasan");
    setRestrictions(result.restrictions || []);
  }

  async function initialHistory(socket: CommunitySocket) {
    const result = await emitAck<HistoryResponse>(socket, "history:list", { direction: "initial", limit: 50 });
    if (!result.ok) throw new Error(result.error?.message || "Gagal memuat chat");
    mergeMessages(result.messages || []);
    setHasMore(!!result.hasMore);
  }

  async function syncAfter(socket: CommunitySocket) {
    let latest = messagesRef.current.at(-1);
    if (!latest) return initialHistory(socket);
    for (let page = 0; page < 50; page += 1) {
      const result = await emitAck<HistoryResponse>(socket, "history:list", { direction: "after", cursor: cursorOf(latest), limit: 100 });
      if (!result.ok) throw new Error(result.error?.message || "Gagal menyinkronkan chat");
      const incoming = result.messages || [];
      if (incoming.length) {
        mergeMessages(incoming);
        latest = incoming.at(-1) || latest;
      }
      if (!result.hasMore || !incoming.length) break;
    }
  }

  useEffect(() => {
    let disposed = false;
    let refreshingToken = false;
    let socket: CommunitySocket | null = null;

    async function start() {
      try {
        const access = await fetchAccess();
        if (disposed) return;
        await ensureSocketClient(access.socketUrl);
        const io = socketFactory();
        if (disposed || !io) return;
        socket = io(access.socketUrl, {
          auth: { token: access.token },
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionDelay: 700,
          reconnectionDelayMax: 5_000,
          timeout: 10_000,
        });
        socketRef.current = socket;

        socket.on("connect", async () => {
          if (disposed || !socket) return;
          setConnection("connected");
          setError("");
          try {
            if (messagesRef.current.length) await syncAfter(socket);
            else await initialHistory(socket);
            await loadRestrictions(socket);
          } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Gagal memuat komunitas");
          } finally {
            setLoading(false);
          }
        });
        socket.on("disconnect", () => { if (!disposed) setConnection("reconnecting"); });
        socket.on("connect_error", async (connectError: Error) => {
          if (disposed || !socket) return;
          const message = String(connectError?.message || "");
          if (!/UNAUTHORIZED|INVALID|ADMIN_FORBIDDEN/i.test(message)) {
            setConnection("reconnecting");
            return;
          }
          if (refreshingToken) return;
          refreshingToken = true;
          try {
            const renewed = await fetchAccess();
            if (!disposed && socket) {
              socket.auth = { token: renewed.token };
              socket.connect();
            }
          } catch (refreshError) {
            setConnection("offline");
            setLoading(false);
            setError(refreshError instanceof Error ? refreshError.message : "Akses komunitas tidak tersedia");
          } finally {
            refreshingToken = false;
          }
        });
        socket.on("message:new", (message: AdminMessage) => mergeMessages([message]));
        socket.on("message:deleted", ({ messageId }: { messageId: string }) => markDeleted(messageId));
        socket.on("restriction:changed", () => { void loadRestrictions(socket); });
      } catch (startError) {
        if (!disposed) {
          setLoading(false);
          setConnection("offline");
          setError(startError instanceof Error ? startError.message : "Gagal membuka komunitas");
        }
      }
    }

    void start();
    return () => {
      disposed = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, []);

  async function loadOlder() {
    const socket = socketRef.current;
    const first = messagesRef.current[0];
    if (!socket?.connected || !first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const result = await emitAck<HistoryResponse>(socket, "history:list", { direction: "before", cursor: cursorOf(first), limit: 50 });
      if (!result.ok) throw new Error(result.error?.message || "Gagal memuat pesan lama");
      mergeMessages(result.messages || []);
      setHasMore(!!result.hasMore);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat pesan lama");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const socket = socketRef.current;
    const body = input.trim();
    if (!socket?.connected || !body || sending) return;
    if ([...body].length > 2000) return setError("Pesan maksimal 2.000 karakter.");
    setSending(true);
    setError("");
    try {
      const result = await emitAck<{ ok: boolean; message?: AdminMessage; error?: { message?: string } }>(socket, "message:send", {
        clientMessageId: crypto.randomUUID(), body, replyToId: replyTo?.id || null,
      });
      if (!result.ok) throw new Error(result.error?.message || "Gagal mengirim pesan");
      if (result.message) mergeMessages([result.message]);
      setInput("");
      setReplyTo(null);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Gagal mengirim pesan");
    } finally {
      setSending(false);
    }
  }

  async function adminAction(key: string, event: string, payload: Record<string, unknown>) {
    const socket = socketRef.current;
    if (!socket?.connected || busyKey) return;
    setBusyKey(key);
    setError("");
    try {
      const result = await emitAck<ActionResponse>(socket, event, payload);
      if (!result.ok) throw new Error(result.error?.message || "Aksi moderasi gagal");
      await loadRestrictions(socket);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Aksi moderasi gagal");
    } finally {
      setBusyKey("");
    }
  }

  function promptReason(defaultValue: string) {
    const value = window.prompt("Alasan moderasi:", defaultValue);
    return value === null ? null : value.trim() || defaultValue;
  }

  function deleteMessage(message: AdminMessage) {
    const reason = promptReason("Pesan melanggar aturan komunitas");
    if (reason === null) return;
    void adminAction(`delete:${message.id}`, "message:delete", { messageId: message.id, reason });
  }

  function muteMember(message: AdminMessage, durationMinutes: 60 | 1440) {
    if (!message.memberId) return;
    const reason = promptReason("Spam atau perilaku mengganggu");
    if (reason === null) return;
    void adminAction(`mute:${message.memberId}`, "member:mute", { memberId: message.memberId, durationMinutes, reason });
  }

  function banMember(message: AdminMessage) {
    if (!message.memberId) return;
    const reason = promptReason("Pelanggaran aturan komunitas");
    if (reason === null || !window.confirm(`Ban ${message.senderName} dari komunitas?`)) return;
    void adminAction(`ban:${message.memberId}`, "member:ban", { memberId: message.memberId, reason });
  }

  function unbanMember(row: Restriction) {
    const reason = promptReason("Pembatasan komunitas dicabut");
    if (reason === null) return;
    void adminAction(`unban:${row.memberId}`, "member:unban", { memberId: row.memberId, reason });
  }

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
    <section className="flex min-h-[650px] flex-col overflow-hidden rounded-xl border border-white/8 bg-white/[.025]">
      <header className="flex items-center justify-between gap-4 border-b border-white/8 px-4 py-3.5">
        <div className="flex items-center gap-3"><MessageCircle size={20}/><div><h2 className="font-black">Live Chat</h2><p className="text-xs text-[var(--text-muted)]">Satu room untuk seluruh Member aktif</p></div></div>
        <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${connection==="connected"?"bg-emerald-500/10 text-emerald-300":"bg-amber-500/10 text-amber-300"}`}>{connection==="connected"?<Wifi size={13}/>:<WifiOff size={13}/>} {connection==="connected"?"Realtime":connection==="offline"?"Offline":"Menyambung"}</div>
      </header>
      {error&&<div className="border-b border-rose-500/15 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading?<div className="grid h-full place-items-center text-[var(--text-muted)]"><Loader2 className="animate-spin"/></div>:<>
          {hasMore&&messages.length>0&&<div className="mb-4 text-center"><button disabled={loadingOlder} onClick={()=>void loadOlder()} className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold text-[var(--text-muted)] hover:bg-white/[.04] disabled:opacity-50">{loadingOlder?"Memuat...":"Muat pesan sebelumnya"}</button></div>}
          <div className="space-y-4">{messages.map((message)=><article key={message.id} className="rounded-xl border border-white/6 bg-black/5 p-3.5">
            <div className="flex flex-wrap items-center gap-2"><span className="font-black">{message.isAdmin?"DorizzStore":message.senderName}</span>{message.isAdmin&&<span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-black text-blue-300">ADMIN</span>}<time className="text-[11px] text-[var(--text-muted)]">{timeFmt.format(new Date(message.createdAt))}</time></div>
            {message.reply&&<div className="mt-2 rounded-lg border-l-2 border-blue-400 bg-blue-500/5 px-3 py-2 text-xs text-[var(--text-muted)]"><strong className="text-blue-300">{message.reply.senderName}</strong><p className="mt-0.5 line-clamp-2">{message.reply.deleted?"Pesan telah dihapus.":message.reply.body}</p></div>}
            <p className={`mt-2 whitespace-pre-wrap break-words text-sm leading-6 ${message.deleted?"italic text-[var(--text-muted)]":""}`}>{message.deleted?"Pesan telah dihapus oleh moderator.":message.body}</p>
            {!message.deleted&&<div className="mt-3 flex flex-wrap gap-2">
              <button onClick={()=>setReplyTo(message)} className="inline-flex items-center gap-1 rounded-lg border border-white/8 px-2.5 py-1.5 text-[11px] font-bold text-[var(--text-muted)] hover:bg-white/[.04]"><Reply size={12}/>Balas</button>
              <button disabled={!!busyKey} onClick={()=>deleteMessage(message)} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/15 px-2.5 py-1.5 text-[11px] font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"><Trash2 size={12}/>Hapus</button>
              {!message.isAdmin&&message.memberId&&<><button disabled={!!busyKey} onClick={()=>muteMember(message,60)} className="inline-flex items-center gap-1 rounded-lg border border-amber-500/15 px-2.5 py-1.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"><VolumeX size={12}/>Mute 1 jam</button><button disabled={!!busyKey} onClick={()=>muteMember(message,1440)} className="inline-flex items-center gap-1 rounded-lg border border-amber-500/15 px-2.5 py-1.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"><VolumeX size={12}/>Mute 24 jam</button><button disabled={!!busyKey} onClick={()=>banMember(message)} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/15 px-2.5 py-1.5 text-[11px] font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"><Ban size={12}/>Ban</button></>}
            </div>}
          </article>)}</div>
        </>}
      </div>
      <form onSubmit={sendMessage} className="border-t border-white/8 p-3.5">
        {replyTo&&<div className="mb-2 flex items-start justify-between gap-3 rounded-lg border border-blue-500/15 bg-blue-500/5 px-3 py-2"><div className="min-w-0"><p className="text-[11px] font-black text-blue-300">Membalas {replyTo.isAdmin?"DorizzStore":replyTo.senderName}</p><p className="truncate text-xs text-[var(--text-muted)]">{replyTo.body}</p></div><button type="button" onClick={()=>setReplyTo(null)}><X size={14}/></button></div>}
        <div className="flex items-end gap-2"><textarea value={input} onChange={(event)=>setInput(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit();}}} maxLength={2000} rows={1} placeholder="Tulis sebagai DorizzStore..." className="min-h-11 flex-1 resize-y rounded-lg border border-white/10 bg-black/10 px-3.5 py-3 text-sm outline-none placeholder:text-[var(--text-muted)]"/><button type="submit" disabled={!input.trim()||sending||connection!=="connected"} className="grid h-11 w-11 place-items-center rounded-lg bg-[var(--accent-primary)] text-white disabled:opacity-40">{sending?<Loader2 size={17} className="animate-spin"/>:<Send size={17}/>}</button></div>
      </form>
    </section>

    <aside className="h-fit rounded-xl border border-white/8 bg-white/[.025] p-4">
      <div className="flex items-center gap-2"><ShieldAlert size={18}/><h2 className="font-black">Pembatasan Aktif</h2></div>
      <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">Hanya member yang sedang di-mute atau di-ban yang tampil. Ini bukan member directory.</p>
      <div className="mt-4 space-y-3">{restrictions.length?restrictions.map((row)=><div key={row.memberId} className="rounded-lg border border-white/8 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-black">{row.name}</p><p className={`mt-1 text-[11px] font-bold ${row.status==="banned"?"text-rose-300":"text-amber-300"}`}>{row.status==="banned"?"BANNED":`MUTED sampai ${row.mutedUntil?new Date(row.mutedUntil).toLocaleString("id-ID",{dateStyle:"short",timeStyle:"short"}):"-"}`}</p></div><button disabled={!!busyKey} onClick={()=>unbanMember(row)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-500/15 px-2 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"><Undo2 size={11}/>{row.status==="banned"?"Unban":"Buka mute"}</button></div>{row.reason&&<p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{row.reason}</p>}</div>):<p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-[var(--text-muted)]">Tidak ada pembatasan aktif.</p>}</div>
    </aside>
  </div>;
}
