import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAffiliate } from "@/lib/affiliate-auth";
import { getPointSummary, pointsToRupiah } from "@/lib/loyalty-points";

export async function GET() {
  const auth = await requireAffiliate();
  if ("error" in auth) return auth.error;

  try {
    const { affiliate } = auth;
    const [member, pointSummary, recentRewards, pendingWithdrawals] = await Promise.all([
      prisma.affiliate.findUnique({
        where: { id: affiliate.id },
        select: {
          id: true,
          name: true,
          email: true,
          whatsapp: true,
          inviteToken: true,
          status: true,
          createdAt: true,
          _count: { select: { referredUsers: true, withdrawals: true } },
        },
      }),
      getPointSummary(affiliate.id, prisma),
      prisma.affiliatePointLedger.findMany({
        where: { affiliateId: affiliate.id, type: "referral_reward" },
        include: {
          user: { select: { name: true } },
          transaction: { select: { productName: true, amount: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.affiliateWithdrawal.count({
        where: { affiliateId: affiliate.id, status: { in: ["pending", "processing", "approved"] } },
      }),
    ]);

    if (!member) {
      return NextResponse.json({ error: "Member tidak ditemukan" }, { status: 404 });
    }

    const monthlyRows = await prisma.affiliatePointLedger.findMany({
      where: { affiliateId: affiliate.id, type: "referral_reward" },
      select: { points: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const monthlyStats: Record<string, number> = {};
    monthlyRows.forEach(row => {
      const month = row.createdAt.toISOString().slice(0, 7);
      monthlyStats[month] = (monthlyStats[month] || 0) + row.points;
    });

    return NextResponse.json({
      member: {
        ...member,
        referralUrl: member.inviteToken ? `/r/${member.inviteToken}` : null,
        ...pointSummary,
        availableRupiah: pointsToRupiah(pointSummary.availablePoints),
      },
      // Keep the old top-level key during the UI migration.
      affiliate: {
        ...member,
        ...pointSummary,
        availableRupiah: pointsToRupiah(pointSummary.availablePoints),
      },
      recentRewards,
      pendingWithdrawals,
      monthlyStats,
    });
  } catch (error) {
    console.error("GET /api/affiliate-portal/dashboard error:", error);
    return NextResponse.json({ error: "Gagal mengambil dashboard member" }, { status: 500 });
  }
}
