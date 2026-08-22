"use client";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Loader2, MessageCircle, Reply, Send, ShieldCheck, Wifi, X } from "lucide-react";

type Message = {
  id: string;
  clientMessageId: string;
  senderName: string;
  isAdmin: boolean;
  body: string;
  reply: { id: string; senderName: string; body: string; deleted: boolean } | null;
  createdAt: string;
  deleted: boolean;
};

type Restriction = { status: "active" | "muted"; mutedUntil: string | null };
type Response = {
  ok?: boolean;
  messages?: Message[];
  hasMore?: boolean;
  message?: Message;
  restriction?: Restriction;
  error?: string;
  mutedUntil?: string | null;
};

const fmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" });
const OWN_MESSAGE_IDS_KEY = "dorizz_member_community_own_message_ids";

function cursor(m: Message) {
  return `cursorId=${encodeURIComponent(m.id)}&cursorAt=${encodeURIComponent(m.createdAt)}`;
}

export default function CommunityClient() {
  const ref = useRef<Message[]>([]);
  const bottom = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [ownMessageIds, setOwnMessageIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [older, setOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState<Message | null>(null);
  const [restriction, setRestriction] = useState<Restriction>({ status: "active", mutedUntil: null });
  const [online, setOnline] = useState(true);

  function merge(items: Message[]) {
    const map = new Map(ref.current.map((m) => [m.id, m]));
    items.forEach((m) => map.set(m.id, { ...map.get(m.id), ...m }));
    const next = [...map.values()].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        a.id.localeCompare(b.id)
    );
    ref.current = next;
    setMessages(next);
  }

  function rememberOwnMessage(clientMessageId: string) {
    setOwnMessageIds((current) => {
      const next = new Set(current);
      next.add(clientMessageId);
      try {
        const recent = [...next].slice(-500);
        window.localStorage.setItem(OWN_MESSAGE_IDS_KEY, JSON.stringify(recent));
        return new Set(recent);
      } catch {
        return next;
      }
    });
  }

  async function request(url: string, init?: RequestInit) {
    const r = await fetch(url, { ...init, cache: "no-store" });
    const j: Response = await r.json();
    if (!r.ok) {
      throw Object.assign(new Error(j.error || "Gagal memuat komunitas"), {
        mutedUntil: j.mutedUntil,
      });
    }
    return j;
  }

  async function initial() {
    const j = await request("/api/member/community/token?direction=initial&limit=50");
    merge(j.messages || []);
    setHasMore(!!j.hasMore);
    if (j.restriction) setRestriction(j.restriction);
  }

  async function poll() {
    const last = ref.current[ref.current.length - 1];
    const url = last
      ? `/api/member/community/token?direction=after&limit=100&${cursor(last)}`
      : "/api/member/community/token?direction=initial&limit=50";
    const j = await request(url);
    merge(j.messages || []);
    if (j.restriction) setRestriction(j.restriction);
    setOnline(true);
  }

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(OWN_MESSAGE_IDS_KEY) || "[]");
      if (Array.isArray(saved)) {
        setOwnMessageIds(new Set(saved.filter((value): value is string => typeof value === "string")));
      }
    } catch {
      // Ignore malformed local storage and continue with an empty set.
    }
  }, []);

  useEffect(() => {
    let stop = false;
    void initial()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const timer = window.setInterval(() => {
      if (!stop) void poll().catch(() => setOnline(false));
    }, 2000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (messages.length) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const muted =
    restriction.status === "muted" &&
    !!restriction.mutedUntil &&
    new Date(restriction.mutedUntil).getTime() > Date.now();
  const mutedText =
    muted && restriction.mutedUntil
      ? new Date(restriction.mutedUntil).toLocaleString("id-ID", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "";

  async function loadOlder() {
    const first = ref.current[0];
    if (!first || older) return;
    setOlder(true);
    try {
      const j = await request(
        `/api/member/community/token?direction=before&limit=50&${cursor(first)}`
      );
      merge(j.messages || []);
      setHasMore(!!j.hasMore);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOlder(false);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = input.trim();
    if (!body || sending || muted) return;
    if ([...body].length > 2000) return setError("Pesan maksimal 2.000 karakter.");

    const clientMessageId = crypto.randomUUID();
    setSending(true);
    setError("");
    try {
      const j = await request("/api/member/community/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientMessageId, body, replyToId: reply?.id || null }),
      });
      rememberOwnMessage(clientMessageId);
      if (j.message) merge([j.message]);
      setInput("");
      setReply(null);
    } catch (e: any) {
      if (e.mutedUntil) setRestriction({ status: "muted", mutedUntil: e.mutedUntil });
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-7.5rem)] min-h-[560px] max-w-5xl flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_18px_55px_rgba(37,99,235,.08)]">
      <header className="flex items-center justify-between gap-4 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-sky-50 px-4 py-4 md:px-5">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-sky-400 text-white">
            <MessageCircle size={21} />
          </div>
          <div>
            <h1 className="font-black text-slate-950">Komunitas Member</h1>
            <p className="text-xs text-slate-500">Satu ruang ngobrol khusus Member DorizzStore</p>
          </div>
        </div>
        <div
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            online ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          <Wifi size={13} />
          {online ? "Live" : "Menyambung"}
        </div>
      </header>

      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-500">
        <ShieldCheck size={15} className="text-blue-500" />
        Privasi aktif: tidak ada DM, daftar member, atau data kontak member.
      </div>

      {muted && (
        <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Kamu bisa membaca chat, tetapi tidak bisa mengirim sampai <strong>{mutedText}</strong>.
        </div>
      )}
      {error && (
        <div className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section className="min-h-0 flex-1 overflow-y-auto bg-slate-50/30 px-3 py-4 md:px-5">
        {loading ? (
          <div className="grid h-full place-items-center text-slate-400">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <>
            {hasMore && messages.length > 0 && (
              <div className="mb-4 text-center">
                <button
                  onClick={() => void loadOlder()}
                  disabled={older}
                  className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700"
                >
                  {older ? "Memuat..." : "Muat pesan sebelumnya"}
                </button>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((m) => {
                const isOwn = ownMessageIds.has(m.clientMessageId);
                return (
                  <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                    <article
                      className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 shadow-sm md:max-w-[70%] ${
                        isOwn
                          ? "rounded-br-md bg-blue-600 text-white"
                          : m.isAdmin
                            ? "rounded-bl-md border border-blue-100 bg-blue-50 text-slate-800"
                            : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                      }`}
                    >
                      <div
                        className={`mb-1 flex items-center gap-2 text-xs ${
                          isOwn ? "justify-end text-blue-100" : "text-slate-500"
                        }`}
                      >
                        {!isOwn && (
                          <strong className={m.isAdmin ? "text-blue-700" : "text-slate-800"}>
                            {m.senderName}
                          </strong>
                        )}
                        {isOwn && <strong className="text-white">Kamu</strong>}
                        <span className={isOwn ? "text-blue-100" : "text-slate-400"}>
                          {fmt.format(new Date(m.createdAt))}
                        </span>
                      </div>

                      {m.reply && (
                        <div
                          className={`mb-2 rounded-lg border-l-2 px-2 py-1.5 text-xs ${
                            isOwn
                              ? "border-white/60 bg-white/15 text-blue-50"
                              : "border-blue-300 bg-blue-50 text-slate-500"
                          }`}
                        >
                          <b>{m.reply.senderName}</b> · {m.reply.deleted ? "Pesan dihapus" : m.reply.body}
                        </div>
                      )}

                      <p
                        className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${
                          m.deleted
                            ? isOwn
                              ? "italic text-blue-100"
                              : "italic text-slate-400"
                            : isOwn
                              ? "text-white"
                              : "text-slate-700"
                        }`}
                      >
                        {m.deleted ? "Pesan dihapus oleh admin" : m.body}
                      </p>

                      {!m.deleted && (
                        <button
                          onClick={() => setReply(m)}
                          className={`mt-2 flex items-center gap-1 text-xs font-bold ${
                            isOwn ? "ml-auto text-blue-100 hover:text-white" : "text-blue-600"
                          }`}
                        >
                          <Reply size={12} />
                          Balas
                        </button>
                      )}
                    </article>
                  </div>
                );
              })}
            </div>
            <div ref={bottom} />
          </>
        )}
      </section>

      <form onSubmit={send} className="border-t border-slate-100 bg-white p-3 md:p-4">
        {reply && (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-xs text-slate-600">
            <span>
              Membalas <b>{reply.senderName}</b>: {reply.body.slice(0, 80)}
            </span>
            <button type="button" onClick={() => setReply(null)}>
              <X size={14} />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={muted || sending}
            rows={2}
            placeholder={muted ? "Kamu sedang di-mute" : "Tulis pesan..."}
            className="min-h-[48px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-blue-400 md:text-sm"
          />
          <button
            disabled={!input.trim() || muted || sending}
            className="grid w-12 place-items-center rounded-xl bg-blue-600 text-white disabled:opacity-40"
          >
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
        <div className="mt-1 text-right text-[10px] text-slate-400">{[...input].length}/2000</div>
      </form>
    </div>
  );
}
