import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";

// GET /api/affiliates - Daftar semua affiliate
export async function GET(req: NextRequest) {
  const auth = await requirePermission("page_affiliates");
  if ("error" in auth) return auth.error;
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { whatsapp: { contains: search } },
      ];
    }
    if (status) where.status = status;

    const [affiliates, pointRows] = await Promise.all([
      prisma.affiliate.findMany({
        where,
        include: {
          _count: { select: { referredUsers: true, commissions: true, withdrawals: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.affiliatePointLedger.groupBy({
        by: ["affiliateId", "status"],
        where: { status: { in: ["available", "held"] } },
        _sum: { points: true },
      }),
    ]);

    const pointMap = new Map<string, { availablePoints: number; pendingPoints: number }>();
    pointRows.forEach(row => {
      const current = pointMap.get(row.affiliateId) || { availablePoints: 0, pendingPoints: 0 };
      const points = Number(row._sum.points || 0);
      if (row.status === "available") current.availablePoints += points;
      if (row.status === "held") current.pendingPoints += Math.abs(points);
      pointMap.set(row.affiliateId, current);
    });

    return NextResponse.json({
      affiliates: affiliates.map(member => ({
        ...member,
        availablePoints: pointMap.get(member.id)?.availablePoints || 0,
        pendingPoints: pointMap.get(member.id)?.pendingPoints || 0,
        availableRupiah: (pointMap.get(member.id)?.availablePoints || 0) * 1000,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST /api/affiliates - Tambah affiliate baru
export async function POST(req: NextRequest) {
  const auth = await requirePermission("page_affiliates");
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json();
    const { name, email, whatsapp, commissionRate } = body;

    if (!name) {
      return NextResponse.json({ error: "Nama affiliate wajib diisi" }, { status: 400 });
    }

    const affiliate = await prisma.affiliate.create({
      data: {
        name,
        email: email || null,
        whatsapp: whatsapp || null,
        commissionRate: commissionRate || 0,
      },
    });

    return NextResponse.json({ affiliate }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
