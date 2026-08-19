import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMemberAdmin } from "@/lib/member-admin-auth";

export async function GET() {
  const a = await requireMemberAdmin(); if ("error" in a) return a.error;
  const [campaigns, prizes, ranking, memberStats] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`SELECT c.*,COUNT(p.id)::int prize_count FROM member_leaderboard_campaigns c LEFT JOIN member_leaderboard_prizes p ON p.campaign_id=c.id GROUP BY c.id ORDER BY c.month_start DESC`),
    prisma.$queryRawUnsafe<any[]>(`SELECT * FROM member_leaderboard_prizes ORDER BY campaign_id,rank`),
    prisma.$queryRawUnsafe<any[]>(`WITH scores AS (
      SELECT m.id,m.name,m.email,COALESCE(SUM(CASE WHEN l.source_type='referral_reward' AND l.points>0 THEN l.points ELSE 0 END),0)::int points
      FROM members m
      LEFT JOIN member_point_ledger l ON l.member_id=m.id
        AND l.created_at>=date_trunc('month',now())
        AND l.created_at<date_trunc('month',now())+interval '1 month'
      WHERE m.status='active'
      GROUP BY m.id,m.name,m.email
    ), ranked AS (
      SELECT *,RANK() OVER(ORDER BY points DESC,name ASC)::int rank FROM scores
    )
    SELECT * FROM ranked ORDER BY rank,name LIMIT 10`),
    prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) FILTER(WHERE status='active')::int active_members,COUNT(*)::int total_members FROM members`),
  ]);
  return NextResponse.json({ campaigns, prizes, ranking, memberStats: memberStats[0] || { active_members: 0, total_members: 0 } });
}

export async function POST(req: Request) {
  const a = await requireMemberAdmin(); if ("error" in a) return a.error;
  const { name, monthStart, monthEnd, prizes = [] } = await req.json();
  if (!name || !monthStart || !monthEnd || new Date(monthEnd) < new Date(monthStart)) return NextResponse.json({ error: "Periode campaign tidak valid" }, { status: 400 });
  const rows = await prisma.$queryRawUnsafe<any[]>(`INSERT INTO member_leaderboard_campaigns(name,month_start,month_end) VALUES($1,$2::date,$3::date) RETURNING id`, name, monthStart, monthEnd);
  for (const p of prizes) {
    if (Number(p.rank) > 0 && String(p.prizeName || "").trim()) await prisma.$executeRawUnsafe(`INSERT INTO member_leaderboard_prizes(campaign_id,rank,prize_name,notes) VALUES($1::uuid,$2,$3,$4)`, rows[0].id, Number(p.rank), p.prizeName, p.notes || null);
  }
  await prisma.$executeRawUnsafe(`INSERT INTO member_admin_activity_log(admin_id,action,entity_type,entity_id,details) VALUES($1::uuid,'leaderboard_campaign_created','leaderboard_campaign',$2::uuid,$3::jsonb)`, a.user.id, rows[0].id, JSON.stringify({ name, monthStart, monthEnd, prizes }));
  return NextResponse.json({ success: true, id: rows[0].id });
}
