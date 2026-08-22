"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Loader2, MessageCircle, Reply, Send, ShieldCheck, Wifi, WifiOff, X } from "lucide-react";

type CommunityMessage = {
  id: string;
  clientMessageId: string;
  senderName: string;
  isAdmin: boolean;
  body: string;
  reply: { id: string; senderName: string; body: string; deleted: boolean } | null;
  createdAt: string;
  deleted: boolean;
};

type CommunitySocket = {
  connected: boolean;
  auth: Record<string, unknown>;
  on: (event: string, callback: (...args: any[]) => void) => CommunitySocket;
  emit: (event: string, ...args: any[]) => CommunitySocket;
  connect: () => CommunitySocket;
  disconnect: () => CommunitySocket;
};

type SocketFactory = (url: string, options?: Record<string, unknown>) => CommunitySocket;
type Restriction = { status: "active" | "muted" | "banned" | "inactive"; mutedUntil: string | null };
type AccessResponse = { token: string; socketUrl: string; restriction: Restriction };
type HistoryResponse = { ok: boolean; messages?: CommunityMessage[]; hasMore?: boolean; error?: { message?: string } };

const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" });

function socketFactory() {
  return (window as unknown as { io?: SocketFactory }).io;
}

function cursorOf(message: CommunityMessage) {
  return { id: message.id, createdAt: message.createdAt };
}

async function fetchAccess(): Promise<AccessResponse> {
  const response = await fetch("/api/member/community/token", { method: "POST", cache: "no-store" });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Gagal membuka komunitas");
  return json;
}

function ensureSocketClient(socketUrl: string) {
  if (socketFactory()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-community-socket="true"]');
    if (existing) {
      if (socketFactory()) return resolve();
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

export default function CommunityClient() {
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const messagesRef = useRef<CommunityMessage[]>([]);
  const socketRef = useRef<CommunitySocket | null>(null);
  const shouldScrollRef = useRef(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [connection, setConnection] = useState<"connecting" | "connected" | "reconnecting" | "offline">("connecting");
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<CommunityMessage | null>(null);
  const [restriction, setRestriction] = useState<Restriction>({ status: "active", mutedUntil: null });

  function mergeMessages(incoming: CommunityMessage[]) {
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

  async function initialHistory(socket: CommunitySocket) {
    const result = await emitAck<HistoryResponse>(socket, "history:list", { direction: "initial", limit: 50 });
    if (!result.ok) throw new Error(result.error?.message || "Gagal memuat chat");
    shouldScrollRef.current = true;
    mergeMessages(result.messages || []);
    setHasMore(!!result.hasMore);
  }

  async function syncAfter(socket: CommunitySocket) {
    let latest: CommunityMessage | null = messagesRef.current.length
      ? messagesRef.current[messagesRef.current.length - 1]
      : null;
    if (!latest) return initialHistory(socket);
    for (let page = 0; page < 50; page += 1) {
      const cursorMessage: CommunityMessage = latest;
      const result: HistoryResponse = await emitAck<HistoryResponse>(socket, "history:list", {
        direction: "after",
        cursor: cursorOf(cursorMessage),
        limit: 100,
      });
      if (!result.ok) throw new Error(result.error?.message || "Gagal menyinkronkan chat");
      const incoming: CommunityMessage[] = result.messages ?? [];
      if (incoming.length) {
        shouldScrollRef.current = true;
        mergeMessages(incoming);
        latest = incoming[incoming.length - 1] ?? latest;
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
        setError("");
        const access = await fetchAccess();
        if (disposed) return;
        setRestriction(access.restriction);
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
          } catch (historyError) {
            setError(historyError instanceof Error ? historyError.message : "Gagal memuat chat");
          } finally {
            setLoading(false);
          }
        });

        socket.on("disconnect", () => {
          if (!disposed) setConnection("reconnecting");
        });

        socket.on("connect_error", async (connectError: Error) => {
          if (disposed || !socket) return;
          const message = String(connectError?.message || "");
          if (!/UNAUTHORIZED|INVALID|MEMBER_INACTIVE|COMMUNITY_BANNED/i.test(message)) {
            setConnection("reconnecting");
            return;
          }
          if (refreshingToken) return;
          refreshingToken = true;
          try {
            const renewed = await fetchAccess();
            if (disposed || !socket) return;
            setRestriction(renewed.restriction);
            socket.auth = { token: renewed.token };
            socket.connect();
          } catch (refreshError) {
            setConnection("offline");
            setLoading(false);
            setError(refreshError instanceof Error ? refreshError.message : "Akses komunitas tidak tersedia");
          } finally {
            refreshingToken = false;
          }
        });

        socket.on("message:new", (message: CommunityMessage) => {
          shouldScrollRef.current = true;
          mergeMessages([message]);
        });
        socket.on("message:deleted", ({ messageId }: { messageId: string }) => markDeleted(messageId));
        socket.on("restriction:changed", (next: Restriction) => {
          setRestriction(next);
          if (next.status === "banned") setError("Akses komunitas kamu dibatasi oleh admin.");
          if (next.status === "inactive") setError("Status Member kamu sudah tidak aktif.");
        });
      } catch (startError) {
        if (disposed) return;
        setLoading(false);
        setConnection("offline");
        setError(startError instanceof Error ? startError.message : "Gagal membuka komunitas");
      }
    }

    void start();
    return () => {
      disposed = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (shouldScrollRef.current && messages.length) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      shouldScrollRef.current = false;
    }
  }, [messages.length]);

  const muted = restriction.status === "muted" && !!restriction.mutedUntil && new Date(restriction.mutedUntil).getTime() > Date.now();
  const mutedText = muted && restriction.mutedUntil
    ? new Date(restriction.mutedUntil).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })
    : "";

  async function loadOlder() {
    const socket = socketRef.current;
    const first = messagesRef.current[0];
    if (!socket || !first || loadingOlder) return;
    setLoadingOlder(true);
    setError("");
    try {
      const result = await emitAck<HistoryResponse>(socket, "history:list", {
        direction: "before",
        cursor: cursorOf(first),
        limit: 50,
      });
      if (!result.ok) throw new Error(result.error?.message || "Gagal memuat pesan lama");
      shouldScrollRef.current = false;
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
    if (restriction.status === "banned" || restriction.status === "inactive") return;
    if (muted) {
      setError(`Kamu sedang di-mute sampai ${mutedText}.`);
      return;
    }
    if ([...body].length > 2000) {
      setError("Pesan maksimal 2.000 karakter.");
      return;
    }

    setSending(true);
    setError("");
    try {
      const result = await emitAck<{ ok: boolean; message?: CommunityMessage; error?: { message?: string; mutedUntil?: string } }>(
        socket,
        "message:send",
        { clientMessageId: crypto.randomUUID(), body, replyToId: replyTo?.id || null }
      );
      if (!result.ok) {
        if (result.error?.mutedUntil) setRestriction({ status: "muted", mutedUntil: result.error.mutedUntil });
        throw new Error(result.error?.message || "Gagal mengirim pesan");
      }
      if (result.message) {
        shouldScrollRef.current = true;
        mergeMessages([result.message]);
      }
      setInput("");
      setReplyTo(null);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Gagal mengirim pesan");
    } finally {
      setSending(false);
    }
  }

  return <div className="mx-auto flex h-[calc(100dvh-7.5rem)] min-h-[560px] max-w-5xl flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_18px_55px_rgba(37,99,235,.08)]">
    <header className="flex items-center justify-between gap-4 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-sky-50 px-4 py-4 md:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-sky-400 text-white shadow-sm shadow-blue-500/20"><MessageCircle size={21}/></div>
        <div className="min-w-0"><h1 className="truncate font-black text-slate-950">Komunitas Member</h1><p className="truncate text-xs text-slate-500">Satu ruang ngobrol khusus Member DorizzStore</p></div>
      </div>
      <div className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${connection === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
        {connection === "connected" ? <Wifi size={13}/> : <WifiOff size={13}/>}
        {connection === "connected" ? "Realtime" : connection === "offline" ? "Offline" : "Menyambung"}
      </div>
    </header>

    <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-500"><ShieldCheck size={15} className="text-blue-500"/><span>Privasi aktif: tidak ada DM, daftar member, atau data kontak member.</span></div>
    {muted&&<div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">Kamu bisa membaca chat, tetapi tidak bisa mengirim pesan sampai <strong>{mutedText}</strong>.</div>}
    {error&&<div role="alert" className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

    <section className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5">
      {loading?<div className="grid h-full place-items-center text-slate-400"><div className="flex items-center gap-2 text-sm"><Loader2 size={18} className="animate-spin"/>Memuat komunitas...</div></div>:<>
        {hasMore&&messages.length>0&&<div className="mb-4 text-center"><button onClick={()=>void loadOlder()} disabled={loadingOlder} className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700 disabled:opacity-50">{loadingOlder?"Memuat...":"Muat pesan sebelumnya"}</button></div>}
        {!messages.length?<div className="grid h-full place-items-center text-center"><div><MessageCircle size={34} className="mx-auto text-blue-300"/><h2 className="mt-3 font-black text-slate-800">Mulai obrolan pertama</h2><p className="mt-1 text-sm text-slate-500">Diskusi di sini terlihat oleh seluruh Member yang punya akses komunitas.</p></div></div>:<div className="space-y-4">
          {messages.map((message)=><article key={message.id} className="group flex gap-3">
            <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-black ${message.isAdmin?"bg-gradient-to-br from-blue-600 to-sky-400 text-white":"bg-slate-100 text-slate-600"}`}>{message.isAdmin?"D":message.senderName.charAt(0).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black text-slate-800">{message.isAdmin?"DorizzStore":message.senderName}</span>{message.isAdmin&&<span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">ADMIN</span>}<time className="text-[11px] text-slate-400">{timeFmt.format(new Date(message.createdAt))}</time></div>
              {message.reply&&<div className="mt-1.5 max-w-2xl rounded-lg border-l-2 border-blue-300 bg-blue-50/70 px-3 py-2 text-xs text-slate-500"><p className="font-bold text-blue-700">{message.reply.senderName}</p><p className="mt-0.5 line-clamp-2">{message.reply.deleted?"Pesan telah dihapus oleh moderator.":message.reply.body}</p></div>}
              <p className={`mt-1 whitespace-pre-wrap break-words text-sm leading-6 ${message.deleted?"italic text-slate-400":"text-slate-700"}`}>{message.deleted?"Pesan telah dihapus oleh moderator.":message.body}</p>
              {!message.deleted&&<button onClick={()=>setReplyTo(message)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 opacity-100 transition hover:text-blue-600 md:opacity-0 md:group-hover:opacity-100"><Reply size={12}/>Balas</button>}
            </div>
          </article>)}
          <div ref={bottomRef}/>
        </div>}
      </>}
    </section>

    <form onSubmit={sendMessage} className="border-t border-blue-100 bg-white p-3 md:p-4">
      {replyTo&&<div className="mb-2 flex items-start justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2"><div className="min-w-0"><p className="text-[11px] font-black text-blue-700">Membalas {replyTo.isAdmin?"DorizzStore":replyTo.senderName}</p><p className="truncate text-xs text-slate-500">{replyTo.body}</p></div><button type="button" onClick={()=>setReplyTo(null)} className="text-slate-400 hover:text-slate-700"><X size={15}/></button></div>}
      <div className="flex items-end gap-2">
        <textarea value={input} onChange={(event)=>setInput(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit();}}} maxLength={2000} rows={1} disabled={restriction.status==="banned"||restriction.status==="inactive"} placeholder={muted?"Kamu sedang di-mute...":"Tulis pesan ke komunitas..."} className="max-h-32 min-h-11 flex-1 resize-y rounded-xl border border-blue-100 bg-slate-50 px-3.5 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-300 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"/>
        <button type="submit" disabled={sending||!input.trim()||connection!=="connected"||muted||restriction.status==="banned"||restriction.status==="inactive"} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-r from-blue-600 to-sky-400 text-white shadow-sm shadow-blue-500/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40">{sending?<Loader2 size={18} className="animate-spin"/>:<Send size={18}/>}</button>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>Enter untuk kirim • Shift+Enter untuk baris baru</span><span>{[...input].length}/2000</span></div>
    </form>
  </div>;
}