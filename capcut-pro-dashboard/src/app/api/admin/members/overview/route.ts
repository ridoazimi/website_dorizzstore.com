import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMemberAdmin } from "@/lib/member-admin-auth";

export async function GET() {
  const a = await requireMemberAdmin();
  if ("error" in a) return a.error;

  const [kpi, topReferrers, popularRewards, referralTrend, pointValueRows] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`
      SELECT
        (SELECT COUNT(*) FROM members)::int total_members,
        (SELECT COUNT(*) FROM members WHERE status='active')::int active_members,
        (SELECT COUNT(*) FROM members WHERE joined_at>=date_trunc('month',now()))::int new_members_month,
        (SELECT COUNT(*) FROM member_referrals WHERE points_awarded>0 AND created_at>=date_trunc('month',now()))::int successful_referrals_month,
        (SELECT COALESCE(SUM(CASE WHEN points>0 THEN points ELSE 0 END),0) FROM member_point_ledger)::int points_issued,
        (SELECT COALESCE(SUM(CASE WHEN status='available' THEN points ELSE 0 END),0) FROM member_point_ledger)::int points_available,
        (SELECT COALESCE(SUM(CASE WHEN status='held' THEN ABS(points) ELSE 0 END),0) FROM member_point_ledger)::int points_held,
        (SELECT COUNT(*) FROM member_redemptions WHERE status='pending')::int pending_redemptions,
        (SELECT COUNT(*) FROM member_withdrawals WHERE status='pending')::int pending_withdrawals
    `),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT m.id,m.name,COUNT(mr.id)::int referrals,COALESCE(SUM(mr.points_awarded),0)::int points
      FROM members m JOIN member_referrals mr ON mr.member_id=m.id
      WHERE mr.points_awarded>0 AND mr.created_at>=date_trunc('month',now())
      GROUP BY m.id ORDER BY referrals DESC,points DESC,m.name ASC LIMIT 5
    `),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT r.id,r.name,COUNT(x.id)::int redemptions
      FROM member_rewards r LEFT JOIN member_redemptions x ON x.reward_id=r.id
      GROUP BY r.id ORDER BY redemptions DESC,r.name ASC LIMIT 5
    `),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT to_char(date_trunc('month',created_at),'YYYY-MM') AS "month",COUNT(*) FILTER(WHERE points_awarded>0)::int AS successful
      FROM member_referrals
      WHERE created_at>=date_trunc('month',now())-interval '5 months'
      GROUP BY date_trunc('month',created_at) ORDER BY date_trunc('month',created_at)
    `),
    prisma.$queryRawUnsafe<any[]>(`SELECT value FROM member_settings WHERE key='point_value_rupiah' LIMIT 1`),
  ]);

  const current = kpi[0] || {};
  const rawPointValue = pointValueRows[0]?.value;
  const pointValue = Number(typeof rawPointValue === "object" ? JSON.stringify(rawPointValue).replace(/\"/g,"") : rawPointValue) || 3000;
  return NextResponse.json({
    kpi: { ...current, point_liability_rupiah: Number(current.points_available || 0) * pointValue },
    topReferrers,
    popularRewards,
    referralTrend,
  });
}
