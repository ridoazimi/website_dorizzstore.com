"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Bell, CircleHelp, Gift, KeyRound, LayoutDashboard, LogOut, Mail, Menu, Medal, MessageCircle, Phone, ShieldCheck, Sparkles, UserRound, Users, WalletCards, X } from "lucide-react";

const items = [
  ["/member/dashboard","Dashboard",LayoutDashboard],
  ["/member/community","Komunitas",MessageCircle],
  ["/member/referral","Referral",Users],
  ["/member/points","Poin",Sparkles],
  ["/member/rewards","Reward",Gift],
  ["/member/redemptions","Penukaran Saya",Gift],
  ["/member/withdrawal","Withdrawal",WalletCards],
  ["/member/leaderboard","Leaderboard",Medal],
  ["/member/activity","Riwayat Aktivitas",Activity],
  ["/member/profile","Profil & Keamanan",UserRound],
  ["/member/help","Bantuan / Cara Kerja",CircleHelp],
  ["/member/terms","Syarat & Ketentuan",ShieldCheck],
] as const;

export default function MemberPortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const communityPage = pathname === "/member/community";
  const [open,setOpen] = useState(false);
  const [profileOpen,setProfileOpen] = useState(false);
  const [profile,setProfile] = useState<any>(null);
  const [unread,setUnread] = useState(0);

  useEffect(()=>{ fetch("/api/member/notifications",{cache:"no-store"}).then(r=>r.ok?r.json():[]).then((x:any[])=>setUnread(Array.isArray(x)?x.filter(n=>!n.is_read).length:0)).catch(()=>{}); },[pathname]);
  useEffect(()=>{ fetch("/api/member/portal/profile",{cache:"no-store"}).then(r=>r.ok?r.json():null).then((x:any)=>setProfile(x?.member||null)).catch(()=>{}); },[pathname]);
  useEffect(()=>{setProfileOpen(false)},[pathname]);

  async function logout(){ await fetch("/api/member/auth/logout",{method:"POST"}); router.replace("/member"); router.refresh(); }

  const nav = <>
    <div className="px-4 pb-5 pt-5">
      <Link href="/member/dashboard" className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 font-black text-white shadow-sm shadow-blue-500/20">D</div>
        <div><p className="text-sm font-black tracking-tight text-slate-950">DorizzStore</p><p className="text-xs text-slate-400">Member Portal</p></div>
      </Link>
    </div>
    <nav className="flex-1 space-y-1 px-3 pb-4">
      {items.map(([href,label,Icon])=>{ const active=pathname===href; return <Link key={href} href={href} onClick={()=>setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${active?"bg-gradient-to-r from-blue-600 to-sky-400 text-white shadow-[0_8px_24px_rgba(37,99,235,.16)]":"text-slate-500 hover:bg-blue-50 hover:text-blue-700"}`}><Icon size={17}/><span className="flex-1">{label}</span></Link>})}
    </nav>
    <div className="border-t border-slate-100 p-3"><button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"><LogOut size={17}/> Logout</button></div>
  </>;

  return <div className={`member-portal bg-[#f8fbff] text-slate-950 ${communityPage ? "h-[100dvh] overflow-hidden" : "min-h-screen"}`}>
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-blue-100 bg-white lg:flex">{nav}</aside>
    {open&&<div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Tutup menu" onClick={()=>setOpen(false)} className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"/><aside className="relative flex h-full w-[290px] flex-col border-r border-blue-100 bg-white shadow-2xl shadow-slate-900/10">{nav}<button aria-label="Tutup menu" onClick={()=>setOpen(false)} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500"><X size={18}/></button></aside></div>}
    <div className={communityPage ? "flex h-full min-h-0 flex-col lg:pl-[248px]" : "lg:pl-[248px]"}>
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-blue-100 bg-white/95 px-4 backdrop-blur md:px-6 lg:px-8">
        <button aria-label="Buka menu" onClick={()=>setOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg border border-blue-100 bg-white text-slate-700 shadow-sm lg:hidden"><Menu size={18}/></button>
        <div className="hidden lg:block"><p className="text-sm font-bold text-slate-950">Member DorizzStore</p><p className="text-xs text-slate-400">Referral • Poin • Reward</p></div>
        <div className="relative flex items-center gap-2">
          <Link href="/member/notifications" className="relative grid h-10 w-10 place-items-center rounded-lg border border-blue-100 bg-white text-slate-500 shadow-sm hover:text-blue-600"><Bell size={18}/>{unread>0&&<span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-500"/>}</Link>
          <button aria-label="Buka profil" onClick={()=>setProfileOpen(v=>!v)} className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-sky-400 text-sm font-black text-white shadow-sm shadow-blue-500/20">{profile?.name?.trim()?.charAt(0)?.toUpperCase()||<UserRound size={18}/>}</button>
          {profileOpen&&<div className="absolute right-0 top-12 z-50 w-[300px] overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_18px_60px_rgba(15,23,42,.14)]">
            <div className="border-b border-slate-100 bg-gradient-to-br from-blue-50 to-sky-50 p-4"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-sky-400 font-black text-white">{profile?.name?.trim()?.charAt(0)?.toUpperCase()||"M"}</div><div className="min-w-0"><p className="truncate font-black text-slate-950">{profile?.name||"Member DorizzStore"}</p><p className="text-xs text-slate-500">Profil Member</p></div></div></div>
            <div className="space-y-1 p-3">
              <div className="flex items-start gap-3 rounded-xl px-3 py-2.5"><Mail size={16} className="mt-0.5 shrink-0 text-blue-500"/><div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Email</p><p className="truncate text-sm font-semibold text-slate-700">{profile?.email||"-"}</p></div></div>
              <div className="flex items-start gap-3 rounded-xl px-3 py-2.5"><Phone size={16} className="mt-0.5 shrink-0 text-blue-500"/><div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">No. HP</p><p className="text-sm font-semibold text-slate-700">{profile?.whatsapp||"-"}</p></div></div>
              <div className="flex items-start gap-3 rounded-xl px-3 py-2.5"><KeyRound size={16} className="mt-0.5 shrink-0 text-blue-500"/><div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Password</p><p className="text-sm font-semibold tracking-widest text-slate-700">••••••••</p></div></div>
              <div className="flex items-start gap-3 rounded-xl px-3 py-2.5"><UserRound size={16} className="mt-0.5 shrink-0 text-blue-500"/><div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Nama</p><p className="truncate text-sm font-semibold text-slate-700">{profile?.name||"-"}</p></div></div>
            </div>
            <div className="border-t border-slate-100 p-3"><Link href="/member/profile" className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-sky-400 px-4 py-2.5 text-sm font-black text-white">Kelola Profil & Password</Link></div>
          </div>}
        </div>
      </header>
      <main className={communityPage ? "mx-auto min-h-0 w-full max-w-[1500px] flex-1 px-0 py-0 md:px-6 md:py-7 lg:px-8" : "mx-auto w-full max-w-[1500px] px-4 py-5 md:px-6 md:py-7 lg:px-8"}>{children}</main>
    </div>
    <style jsx global>{`
      .member-portal [class*="bg-[#111a2a]"] { background-color:#fff !important; border-color:#dbeafe !important; box-shadow:0 10px 35px rgba(37,99,235,.055); }
      .member-portal [class*="bg-[#0b1321]"] { background-color:#fff !important; border-color:#dbeafe !important; }
      .member-portal [class*="border-white/8"], .member-portal [class*="border-white/10"], .member-portal [class*="divide-white/6"] { border-color:#e2e8f0 !important; }
      .member-portal [class*="divide-white/6"] > :not([hidden]) ~ :not([hidden]) { border-color:#eef2f7 !important; }
      .member-portal [class*="bg-white/[.025]"], .member-portal [class*="bg-white/[.035]"], .member-portal [class*="bg-white/[.04]"], .member-portal [class*="bg-white/[.05]"], .member-portal [class*="bg-white/[.06]"], .member-portal [class*="bg-white/[.07]"] { background-color:#f8fbff !important; }
      .member-portal [class*="text-slate-100"], .member-portal [class*="text-slate-200"], .member-portal [class*="text-white"]:not(button):not(a) { color:#0f172a !important; }
      .member-portal [class*="text-slate-300"] { color:#475569 !important; }
      .member-portal [class*="text-slate-400"] { color:#64748b !important; }
      .member-portal [class*="text-slate-500"] { color:#64748b !important; }
      .member-portal [class*="text-slate-600"] { color:#94a3b8 !important; }
      .member-portal [class*="text-[#ff8b63]"] { color:#2563eb !important; }
      .member-portal [class*="bg-[#ff6b35]"] { background:linear-gradient(90deg,#2563eb,#38bdf8) !important; }
      .member-portal [class*="hover:border-[#ff6b35]"]:hover { border-color:#60a5fa !important; }
      .member-portal input, .member-portal select { color:#0f172a !important; background:#fff !important; border-color:#dbeafe !important; }
      .member-portal input::placeholder { color:#94a3b8 !important; }
      .member-portal option { color:#0f172a; background:#fff; }
      .member-portal [class*="bg-amber-400/8"] { background:#fffbeb !important; color:#92400e !important; }
      .member-portal [class*="bg-cyan-400/8"] { background:#eff6ff !important; color:#1d4ed8 !important; border-color:#bfdbfe !important; }
      .member-portal [class*="text-cyan-200"] { color:#1d4ed8 !important; }
      .member-portal [class*="text-violet-300"] { color:#2563eb !important; }
      .member-portal [class*="bg-violet-400"] { background:#3b82f6 !important; }
      .member-portal [class*="text-emerald-300"] { color:#059669 !important; }
      .member-portal [class*="text-amber-300"] { color:#d97706 !important; }
      .member-portal [class*="text-rose-300"] { color:#e11d48 !important; }
    `}</style>
  </div>;
}
