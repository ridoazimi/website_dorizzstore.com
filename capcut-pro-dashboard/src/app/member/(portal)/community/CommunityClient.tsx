"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

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

function socketFactory() { return (window as unknown as { io?: SocketFactory }).io; }
function cursorOf(message: CommunityMessage) { return { id: message.id, createdAt: message.createdAt }; }

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
  const [hasMore, setHasMore] = useState(false);
  const [restriction, setRestriction] = useState<Restriction>({ status: "active", mutedUntil: null });
  const [input, setInput] = useState("");

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

  useEffect(() => { void fetchAccess(); }, []);
  function submit(event: FormEvent) { event.preventDefault(); void emitAck(socketRef.current as CommunitySocket, "message:send", { body: input }); }
  return <form onSubmit={submit}><div>{messages.length} / {restriction.status} / {String(hasMore)}</div><input value={input} onChange={(e)=>setInput(e.target.value)}/><button type="submit">Kirim</button></form>;
}
