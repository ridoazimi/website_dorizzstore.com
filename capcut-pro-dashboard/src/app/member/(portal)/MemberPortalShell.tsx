"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Bell, CircleHelp, Gift, LayoutDashboard, LogOut, Menu, Medal, ShieldCheck, Sparkles, UserRound, Users, WalletCards, X } from "lucide-react";

const items = [
  ["/member/dashboard","Dashboard",LayoutDashboard],
  ["/member/referral","Referral",Users],
  ["/member/points","Poin",Sparkles],
  ["/member/rewards","Reward",Gift],
  ["/member/redemptions","Penukaran Saya",Gift],
  ["/member/withdrawal","Withdrawal",WalletCards],
  ["/member/leaderboard","Leaderboard",Medal],
  ["/member/notifications","Notifikasi",Bell],
  ["/member/activity","Riwayat Aktivitas",Activity],
  ["/member/profile","Profil & Keamanan",UserRound],
  ["/member/help","Bantuan / Cara Kerja",CircleHelp],
  ["/member/terms","Syarat & Ketentuan",ShieldCheck],
] as const;

export default function MemberPortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open,setOpen] = useState(false);
  const [unread,setUnread] = useState(0);

  useEffect(()=>{ fetch("/api/member/notifications",{cache:"no-store"}).then(r=>r.ok?r.json():[]).then((x:any[])=>setUnread(Array.isArray(x)?x.filter(n=>!n.is_read).length:0)).catch(()=>{}); },[pathname]);

  async function logout(){ await fetch("/api/member/auth/logout",{method:"POST"}); router.replace("/member"); router.refresh(); }

  const nav = <>
    <div className="px-4 pb-5 pt-5">
      <Link href="/member/dashboard" className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#ff6b35] font-black text-white">D</div>
        <div><p className="text-sm font-black tracking-tight text-white">DorizzStore</p><p className="text-xs text-slate-500">Member Portal</p></div>
      </Link>
    </div>
    <nav className="flex-1 space-y-1 px-3 pb-4">
      {items.map(([href,label,Icon])=>{ const active=pathname===href; return <Link key={href} href={href} onClick={()=>setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${active?"bg-[#ff6b35] text-white shadow-[0_8px_24px_rgba(255,107,53,.22)]":"text-slate-400 hover:bg-white/[.05] hover:text-white"}`}><Icon size={17}/><span className="flex-1">{label}</span>{label==="Notifikasi"&&unread>0&&<span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-black">{unread}</span>}</Link>})}
    </nav>
    <div className="border-t border-white/8 p-3"><button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300"><LogOut size={17}/> Logout</button></div>
  </>;

  return <div className="min-h-screen bg-[#0b1220] text-slate-100">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-white/8 bg-[#090f1b] lg:flex">{nav}</aside>
    {open&&<div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Tutup menu" onClick={()=>setOpen(false)} className="absolute inset-0 bg-black/60"/><aside className="relative flex h-full w-[290px] flex-col border-r border-white/10 bg-[#090f1b] shadow-2xl">{nav}<button aria-label="Tutup menu" onClick={()=>setOpen(false)} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-slate-300"><X size={18}/></button></aside></div>}
    <div className="lg:pl-[248px]">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/8 bg-[#0b1220]/95 px-4 backdrop-blur md:px-6 lg:px-8">
        <button aria-label="Buka menu" onClick={()=>setOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[.03] lg:hidden"><Menu size={18}/></button>
        <div className="hidden lg:block"><p className="text-sm font-bold text-white">Member DorizzStore</p><p className="text-xs text-slate-500">Referral • Poin • Reward</p></div>
        <Link href="/member/notifications" className="relative grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[.03] text-slate-300 hover:text-white"><Bell size={18}/>{unread>0&&<span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400"/>}</Link>
      </header>
      <main className="mx-auto w-full max-w-[1500px] px-4 py-5 md:px-6 md:py-7 lg:px-8">{children}</main>
    </div>
  </div>;
}
