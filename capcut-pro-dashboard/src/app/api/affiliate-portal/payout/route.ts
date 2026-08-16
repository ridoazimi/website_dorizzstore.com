import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAffiliate } from "@/lib/affiliate-auth";
import {
  MIN_WITHDRAW_POINTS,
  MAX_WITHDRAW_POINTS,
  POINTS_PER_NEW_CUSTOMER,
  pointsToRupiah,
} from "@/lib/loyalty-points";

const METHODS = ["dana", "gopay", "ovo", "shopeepay", "bank_transfer"] as const;

export async function POST(req: NextRequest) {
  const auth = await requireAffiliate();
  if ("error" in auth) return auth.error;

  try {
    const { affiliate } = auth;
    const body = await req.json();
    const points = Math.trunc(Number(body.points));
    const method = String(body.method || "");
    const accountNumber = String(body.accountNumber || "").trim();
    const accountName = String(body.accountName || "").trim();

    if (!Number.isInteger(points) || points <= 0) {
      return NextResponse.json({ error: "Jumlah poin tidak valid" }, { status: 400 });
    }
    if (points < MIN_WITHDRAW_POINTS) {
      return NextResponse.json({ error: `Minimum withdraw ${MIN_WITHDRAW_POINTS} poin (Rp ${pointsToRupiah(MIN_WITHDRAW_POINTS).toLocaleString("id-ID")})` }, { status: 400 });
    }
    if (points % POINTS_PER_NEW_CUSTOMER !== 0) {
      return NextResponse.json({ error: `Jumlah withdraw harus kelipatan ${POINTS_PER_NEW_CUSTOMER} poin` }, { status: 400 });
    }
    if (points > MAX_WITHDRAW_POINTS) {
      return NextResponse.json({ error: `Maksimum withdraw ${MAX_WITHDRAW_POINTS} poin` }, { status: 400 });
    }
    if (!METHODS.includes(method as typeof METHODS[number])) {
      return NextResponse.json({ error: "Metode pembayaran tidak valid" }, { status: 400 });
    }
    if (accountNumber.length < 6 || accountNumber.length > 100) {
      return NextResponse.json({ error: "Nomor rekening atau e-wallet tidak valid" }, { status: 400 });
    }

    const withdrawal = await prisma.$transaction(async (tx) => {
      const activeWithdrawal = await tx.affiliateWithdrawal.findFirst({
        where: { affiliateId: affiliate.id, status: { in: ["pending", "processing", "approved"] } },
        select: { id: true },
      });
      if (activeWithdrawal) throw new Error("WITHDRAW_MASIH_DIPROSES");

      const rows = await tx.$queryRaw<Array<{ id: string; points: number }>>`
        SELECT id, points
        FROM affiliate_point_ledger
        WHERE affiliate_id = ${affiliate.id}::uuid
          AND status = 'available'
        ORDER BY created_at ASC
        FOR UPDATE
      `;
      const availablePoints = rows.reduce((sum, row) => sum + row.points, 0);
      if (availablePoints < points) throw new Error("POIN_TIDAK_CUKUP");

      const selectedIds: string[] = [];
      let selectedPoints = 0;
      for (const row of rows) {
        selectedIds.push(row.id);
        selectedPoints += row.points;
        if (selectedPoints >= points) break;
      }

      const created = await tx.affiliateWithdrawal.create({
        data: {
          affiliateId: affiliate.id,
          amount: pointsToRupiah(points),
          points,
          method,
          accountNumber,
          accountName: accountName || null,
          status: "pending",
          notes: `Withdraw mandiri ${points} poin (${POINTS_PER_NEW_CUSTOMER} poin per customer baru)`,
        },
      });

      const held = await tx.affiliatePointLedger.updateMany({
        where: { id: { in: selectedIds }, status: "available" },
        data: { status: "held", withdrawalId: created.id },
      });
      if (held.count !== selectedIds.length) throw new Error("WITHDRAW_RETRY");

      return created;
    });

    return NextResponse.json({
      success: true,
      message: "Withdraw berhasil diajukan dan menunggu diproses admin.",
      withdrawal,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "WITHDRAW_MASIH_DIPROSES") {
      return NextResponse.json({ error: "Masih ada pengajuan withdraw yang sedang diproses." }, { status: 409 });
    }
    if (message === "POIN_TIDAK_CUKUP") {
      return NextResponse.json({ error: "Saldo poin tersedia tidak mencukupi." }, { status: 400 });
    }
    if (message === "WITHDRAW_RETRY") {
      return NextResponse.json({ error: "Saldo berubah karena proses lain. Silakan coba lagi." }, { status: 409 });
    }
    console.error("POST /api/affiliate-portal/payout error:", error);
    return NextResponse.json({ error: "Gagal membuat pengajuan withdraw" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAffiliate();
  if ("error" in auth) return auth.error;

  try {
    const { affiliate } = auth;
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || 20)));
    const where = { affiliateId: affiliate.id };
    const [withdrawals, total] = await Promise.all([
      prisma.affiliateWithdrawal.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          points: true,
          amount: true,
          method: true,
          accountNumber: true,
          accountName: true,
          payoutReference: true,
          status: true,
          notes: true,
          createdAt: true,
          processedAt: true,
        },
      }),
      prisma.affiliateWithdrawal.count({ where }),
    ]);

    return NextResponse.json({
      withdrawals,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("GET /api/affiliate-portal/payout error:", error);
    return NextResponse.json({ error: "Gagal mengambil histori withdraw" }, { status: 500 });
  }
}
