import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";

const ALLOWED_STATUS = ["pending", "processing", "approved", "paid", "rejected"] as const;

export async function GET(req: NextRequest) {
  const auth = await requirePermission("page_affiliates");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "pending";
    const statuses = status === "all" ? undefined : [status];
    const withdrawals = await prisma.affiliateWithdrawal.findMany({
      where: statuses ? { status: { in: statuses } } : undefined,
      orderBy: { createdAt: "asc" },
      take: 100,
      include: {
        affiliate: { select: { id: true, name: true, email: true, whatsapp: true } },
        pointEntries: { select: { id: true, points: true, status: true } },
      },
    });
    return NextResponse.json({ withdrawals });
  } catch (error) {
    console.error("GET /api/affiliates/withdrawals error:", error);
    return NextResponse.json({ error: "Gagal mengambil pengajuan withdraw" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission("page_affiliates");
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const id = String(body.id || "");
    const nextStatus = String(body.status || "");
    const notes = body.notes === undefined ? undefined : String(body.notes || "");
    const payoutReference = body.payoutReference === undefined ? undefined : String(body.payoutReference || "");

    if (!id || !ALLOWED_STATUS.includes(nextStatus as typeof ALLOWED_STATUS[number])) {
      return NextResponse.json({ error: "Data status withdraw tidak valid" }, { status: 400 });
    }

    const updated = await prisma.$transaction(async tx => {
      const withdrawal = await tx.affiliateWithdrawal.findUnique({
        where: { id },
        include: { pointEntries: true },
      });
      if (!withdrawal) throw new Error("WITHDRAW_TIDAK_DITEMUKAN");
      if (["paid", "rejected"].includes(withdrawal.status || "")) {
        throw new Error("WITHDRAW_SUDAH_FINAL");
      }
      if (nextStatus === "paid" && !["pending", "processing", "approved"].includes(withdrawal.status || "")) {
        throw new Error("TRANSISI_TIDAK_VALID");
      }
      if (nextStatus === "rejected" && withdrawal.status === "paid") {
        throw new Error("WITHDRAW_SUDAH_FINAL");
      }

      const data: {
        status: string;
        notes?: string;
        payoutReference?: string;
        processedAt?: Date;
      } = { status: nextStatus };
      if (notes !== undefined) data.notes = notes;
      if (payoutReference !== undefined) data.payoutReference = payoutReference;
      if (["paid", "rejected"].includes(nextStatus)) data.processedAt = new Date();

      if (nextStatus === "paid") {
        await tx.affiliatePointLedger.updateMany({
          where: { withdrawalId: id, status: "held" },
          data: { status: "spent" },
        });
      }
      if (nextStatus === "rejected") {
        await tx.affiliatePointLedger.updateMany({
          where: { withdrawalId: id, status: "held" },
          data: { status: "available", withdrawalId: null },
        });
      }

      return tx.affiliateWithdrawal.update({ where: { id }, data });
    });

    return NextResponse.json({ success: true, withdrawal: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "WITHDRAW_TIDAK_DITEMUKAN") return NextResponse.json({ error: "Pengajuan withdraw tidak ditemukan" }, { status: 404 });
    if (message === "WITHDRAW_SUDAH_FINAL") return NextResponse.json({ error: "Pengajuan withdraw sudah final" }, { status: 409 });
    if (message === "TRANSISI_TIDAK_VALID") return NextResponse.json({ error: "Perubahan status tidak valid" }, { status: 400 });
    console.error("PATCH /api/affiliates/withdrawals error:", error);
    return NextResponse.json({ error: "Gagal memperbarui withdraw" }, { status: 500 });
  }
}
