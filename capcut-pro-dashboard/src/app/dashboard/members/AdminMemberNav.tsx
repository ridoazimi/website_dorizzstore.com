"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Gift, LayoutDashboard, Medal, MessageCircle, Settings2, Sparkles, Users, WalletCards, BadgeDollarSign } from "lucide-react";

const items = [
  ["/dashboard/members","Overview",LayoutDashboard],
  ["/dashboard/members/list","Member List",Users],
  ["/dashboard/members/community","Komunitas",MessageCircle],
  ["/dashboard/members/rewards","Reward",Gift],
  ["/dashboard/members/redemptions","Redemption",Sparkles],
  ["/dashboard/members/withdrawals","Withdrawal",WalletCards],
  ["/dashboard/members/leaderboard","Leaderboard",Medal],
  ["/dashboard/members/points","Point Adjustment",BadgeDollarSign],
  ["/dashboard/members/settings","Settings",Settings2],
  ["/dashboard/members/activity","Activity Log",Activity],
] as const;

export default function AdminMemberNav(){
  const pathname=usePathname();
  return <div className="overflow-x-auto border-b border-white/8"><nav className="flex min-w-max gap-1 pb-3">{items.map(([href,label,Icon])=>{const active=pathname===href;return <Link key={href} href={href} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${active?"bg-[var(--accent-primary)] text-white":"text-[var(--text-muted)] hover:bg-white/[.04] hover:text-[var(--text-primary)]"}`}><Icon size={15}/>{label}</Link>})}</nav></div>
}
