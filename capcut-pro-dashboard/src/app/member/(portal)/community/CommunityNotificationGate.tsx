"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const OWN_MESSAGE_IDS_KEY = "dorizz_member_community_own_message_ids";

type Message = {
  id: string;
  clientMessageId: string;
  senderName: string;
  isAdmin: boolean;
  body: string;
  createdAt: string;
  deleted: boolean;
};

type CommunityResponse = {
  messages?: Message[];
  self?: { name: string };
};

type PermissionState = NotificationPermission | "unsupported" | "checking";

function ownIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(OWN_MESSAGE_IDS_KEY) || "[]");
    return new Set<string>(Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  const iosStandalone = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone;
}

export default function CommunityNotificationGate({ children }: { children: ReactNode }) {
  const [permission, setPermission] = useState<PermissionState>("checking");
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [iosBrowser, setIosBrowser] = useState(false);
  const cursor = useRef<{ id: string; createdAt: string } | null>(null);
  const initialized = useRef(false);

  const registerWorker = useCallback(async () => {
    if (!("serviceWorker" in navigator)) throw new Error("Browser ini belum mendukung notifikasi Community.");
    return navigator.serviceWorker.register("/community-notifications-sw.js", { scope: "/" });
  }, []);

  const refreshPermission = useCallback(() => {
    const iosSafariBrowser = isIOS() && !isStandalone();
    setIosBrowser(iosSafariBrowser);
    if (iosSafariBrowser) {
      setPermission("checking");
      return false;
    }
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return false;
    }
    setPermission(Notification.permission);
    return Notification.permission === "granted";
  }, []);

  const askPermission = useCallback(async () => {
    setRequesting(true);
    setError("");
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        setPermission("unsupported");
        return;
      }
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") await registerWorker();
    } catch (cause) {
      console.error("Community notification permission error", cause);
      setError("Notifikasi belum bisa diaktifkan. Coba lagi atau periksa pengaturan browser.");
    } finally {
      setRequesting(false);
    }
  }, [registerWorker]);

  useEffect(() => {
    if (!refreshPermission()) return;
    void registerWorker().catch((cause) => {
      console.error("Community notification worker error", cause);
      setError("Notifikasi belum siap. Muat ulang halaman lalu coba lagi.");
    });
  }, [refreshPermission, registerWorker]);

  useEffect(() => {
    if (permission !== "granted") return;
    let stopped = false;

    async function checkMessages() {
      try {
        const current = cursor.current;
        const url = current
          ? `/api/member/community/token?direction=after&limit=50&cursorId=${encodeURIComponent(current.id)}&cursorAt=${encodeURIComponent(current.createdAt)}`
          : "/api/member/community/token?direction=initial&limit=1";
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return;
        const data: CommunityResponse = await response.json();
        const items = data.messages || [];
        const latest = items.at(-1);
        if (latest) cursor.current = { id: latest.id, createdAt: latest.createdAt };

        if (!initialized.current) {
          initialized.current = true;
          return;
        }
        if (!document.hidden || !items.length) return;

        const mine = ownIds();
        const incoming = items.filter((message) => !message.deleted && !mine.has(message.clientMessageId));
        if (!incoming.length) return;
        const message = incoming.at(-1)!;
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(message.isAdmin ? "DorizzStore" : message.senderName, {
          body: message.body.length > 120 ? `${message.body.slice(0, 117)}...` : message.body,
          tag: `community-${message.id}`,
          data: { url: "/member/community" },
        });
      } catch (cause) {
        console.error("Community notification poll error", cause);
      }
    }

    void checkMessages();
    const timer = window.setInterval(() => {
      if (!stopped) void checkMessages();
    }, 5000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [permission]);

  if (permission === "granted") return <>{children}</>;

  if (iosBrowser) {
    return (
      <div className="fixed inset-0 z-[100] flex items-end bg-slate-950/35 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-[2px]">
        <div className="w-full rounded-[28px] bg-white px-5 pb-5 pt-3 shadow-2xl">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-50 text-xl">📲</div>
            <div className="min-w-0 text-left">
              <h1 className="text-base font-black text-slate-950">Tambahkan ke Layar Utama</h1>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">Pasang DorizzStore agar notifikasi Community bisa diaktifkan.</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-slate-50 px-3 py-3 text-center">
              <div className="text-xl">⬆️</div>
              <p className="mt-1 text-xs font-bold text-slate-700">1. Tekan Share</p>
            </div>
            <div className="rounded-2xl bg-blue-50 px-3 py-3 text-center">
              <div className="text-xl">➕</div>
              <p className="mt-1 text-xs font-bold text-blue-700">2. Add to Home Screen</p>
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-slate-400">Setelah terpasang, buka DorizzStore dari ikon Home Screen.</p>
        </div>
      </div>
    );
  }

  const denied = permission === "denied";
  const unsupported = permission === "unsupported";

  return (
    <div className="mx-auto grid min-h-[65vh] max-w-xl place-items-center px-4 py-10">
      <div className="w-full rounded-2xl border border-blue-100 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-xl">🔔</div>
        <h1 className="text-lg font-black text-slate-950">Aktifkan Notifikasi Community</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Notifikasi wajib diaktifkan agar kamu bisa masuk ke Community dan tidak melewatkan pesan baru dari DorizzStore atau member lain.
        </p>
        {denied && (
          <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            Notifikasi sedang diblokir. Buka pengaturan DorizzStore di perangkat/browser, izinkan Notifikasi, lalu tekan Cek Lagi.
          </p>
        )}
        {unsupported && (
          <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
            Perangkat atau browser ini belum menyediakan izin notifikasi untuk DorizzStore.
          </p>
        )}
        {error && <p className="mt-4 text-xs text-rose-600">{error}</p>}
        {!unsupported && (
          <button
            type="button"
            disabled={requesting}
            onClick={denied ? refreshPermission : () => void askPermission()}
            className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:bg-slate-300"
          >
            {requesting ? "Meminta izin..." : denied ? "Cek Lagi" : "Izinkan Notifikasi"}
          </button>
        )}
      </div>
    </div>
  );
}
