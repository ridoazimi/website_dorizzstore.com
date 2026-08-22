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

function socketFactory() {
  return (window as unknown as { io?: SocketFactory }).io;
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
  const socketRef = useRef<CommunitySocket | null>(null);
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [restriction, setRestriction] = useState<Restriction>({ status: "active", mutedUntil: null });
  const [input, setInput] = useState("");
  useEffect(() => { void fetchAccess(); }, []);
  function submit(event: FormEvent) { event.preventDefault(); void emitAck(socketRef.current as CommunitySocket, "message:send", { body: input }); }
  return <form onSubmit={submit}><div>{messages.length} / {restriction.status}</div><input value={input} onChange={(e)=>setInput(e.target.value)}/><button type="submit">Kirim</button></form>;
}
