"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Crown, Medal, Trophy, UserRound } from "lucide-react";
import MemberPortalShell from "../(portal)/MemberPortalShell";

const fmt = (value: number) => new Intl.NumberFormat("id-ID").format(Number(value || 0));

const podiumStyles = [
  {
    badge: "bg-gradient-to-br from-amber-300 to-amber-500 text-[#3c2500] shadow-[0_0_24px_rgba(251,191,36,.18)]",
    border: "border-amber-400/25",
    icon: <Crown size={18} strokeWidth={2.5} />,
    label: "Juara 1",
  },
  {
    badge: "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900",
    border: "border-slate-300/15",
    icon: <Medal size={18} strokeWidth={2.5} />,
    label: "Juara 2",
  },
  {
    badge: "bg-gradient-to-br from-orange-600 to-amber-700 text-white",
    border: "border-orange-400/15",
    icon: <Medal size={18} strokeWidth={2.5} />,
    label: "Juara 3",
  },
];

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/member/leaderboard", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const top10 = data?.top10 ?? [];
  const top3 = top10.slice(0, 3);
  const rest = top10.slice(3);

  return (
    <MemberPortalShell>
      <div className="mx-auto max-w-4xl">
        <Link
          href="/member/dashboard"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-white"
        >
          <ArrowLeft size={16} />
          Dashboard Member
        </Link>

        <section className="mt-6 overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1626] shadow-[0_28px_80px_rgba(0,0,0,.25)]">
          <div className="relative border-b border-white/8 px-5 py-6 sm:px-7 sm:py-7">
            <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />
            <div className="relative flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-amber-300">
                <Trophy size={24} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Peringkat Member</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Leaderboard Bulanan</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  Top 10 dihitung dari poin referral bulan berjalan. Hadiah leaderboard tidak memotong poin.
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-7">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-24 animate-pulse rounded-2xl bg-white/[.04]" />
                ))}
              </div>
            ) : top10.length ? (
              <>
                <div className="mb-4 flex items-center gap-2 text-sm font-black text-slate-200">
                  <Trophy size={17} className="text-amber-300" />
                  Papan Peringkat Sementara
                </div>

                <div className="grid gap-3">
                  {top3.map((member: any, index: number) => {
                    const style = podiumStyles[index];
                    return (
                      <article
                        key={`${member.rank}-${member.name}-${index}`}
                        className={`flex items-center justify-between gap-4 rounded-2xl border bg-[#121d30] p-4 sm:p-5 ${style.border}`}
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          <div className={`flex h-12 min-w-12 items-center justify-center gap-1 rounded-xl px-3 text-sm font-black ${style.badge}`}>
                            {style.icon}
                            <span>{index + 1}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-base font-black text-white sm:text-lg">{member.name}</p>
                            <p className="mt-0.5 text-xs font-semibold text-slate-500">{style.label}</p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-lg font-black text-amber-300 sm:text-xl">{fmt(member.points)}</p>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">poin</p>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {rest.length > 0 && (
                  <div className="mt-5 space-y-2 border-t border-white/8 pt-5">
                    {rest.map((member: any, index: number) => (
                      <article
                        key={`${member.rank}-${member.name}-${index + 3}`}
                        className="flex items-center justify-between gap-4 rounded-xl border border-white/[.06] bg-white/[.025] px-4 py-3.5"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[.06] text-sm font-black text-slate-300">
                            #{index + 4}
                          </div>
                          <p className="truncate font-bold text-slate-200">{member.name}</p>
                        </div>
                        <p className="shrink-0 font-black text-amber-300">{fmt(member.points)} poin</p>
                      </article>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[.025] p-8 text-center text-sm text-slate-400">
                Leaderboard belum memiliki data bulan ini.
              </div>
            )}
          </div>
        </section>

        {data?.self && (
          <section className="relative mt-5 overflow-hidden rounded-2xl border border-[#ff7a45]/40 bg-[#111b2d] p-5 shadow-[0_18px_50px_rgba(0,0,0,.18)] sm:p-6">
            <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#ff6b35]/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#ff6b35]/12 text-[#ff8b63]">
                  <UserRound size={22} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff8b63]">Peringkat Kamu</p>
                  <p className="mt-1 text-xl font-black">#{data.self.rank} · {data.self.name}</p>
                </div>
              </div>
              <div className="sm:text-right">
                <p className="text-2xl font-black text-white">{fmt(data.self.points)} poin</p>
                <p className="text-xs font-semibold text-slate-500">terkumpul bulan ini</p>
              </div>
            </div>
          </section>
        )}
      </div>
    </MemberPortalShell>
  );
}
