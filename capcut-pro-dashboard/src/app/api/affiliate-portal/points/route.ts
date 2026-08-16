import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAffiliate } from "@/lib/affiliate-auth";

export async function GET(req: NextRequest) {
  const auth = await requireAffiliate();
  if ("error" in auth) return auth.error;

  try {
    const { affiliate } = auth;
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || 30)));
    const where = { affiliateId: affiliate.id };
    const [entries, total] = await Promise.all([
      prisma.affiliatePointLedger.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { name: true } },
          transaction: { select: { productName: true } },
          withdrawal: { select: { id: true, status: true } },
        },
      }),
      prisma.affiliatePointLedger.count({ where }),
    ]);
    return NextResponse.json({ entries, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    console.error("GET /api/affiliate-portal/points error:", error);
    return NextResponse.json({ error: "Gagal mengambil histori poin" }, { status: 500 });
  }
}
