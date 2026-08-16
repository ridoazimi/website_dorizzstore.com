import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";

// POST /api/stock/[id]/use - Alokasikan akun stok ke transaksi
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("page_transactions");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { transactionId } = body;

    const allocation = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: string;
        used_slots: number;
        max_slots: number;
      }>>`
        SELECT
          sa.id,
          GREATEST(
            COALESCE(sa.used_slots, 0),
            COALESCE(success_usage.transaction_count, 0)
              + COALESCE(legacy_usage.allocation_count, 0)
          )::int AS used_slots,
          COALESCE(sa.max_slots, 3)::int AS max_slots
        FROM stock_accounts sa
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS transaction_count
          FROM transactions t
          WHERE t.stock_account_id = sa.id
            AND t.status = 'success'
        ) success_usage ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS allocation_count
          FROM stock_allocations a
          WHERE a.stock_account_id = sa.id
            AND a.status = 'active'
            AND NOT EXISTS (
              SELECT 1
              FROM transactions t
              WHERE t.stock_account_id = a.stock_account_id
                AND t.status = 'success'
                AND t.lynk_id_ref = CASE
                  WHEN a.order_id IS NULL THEN NULL
                  ELSE 'shopee:' || a.order_id
                END
            )
        ) legacy_usage ON TRUE
        WHERE sa.id = ${id}::uuid
        FOR UPDATE OF sa
      `;

      const stockAccount = rows[0];
      if (!stockAccount) throw new Error("AKUN_TIDAK_DITEMUKAN");
      if (stockAccount.used_slots >= stockAccount.max_slots) {
        throw new Error("SLOT_PENUH");
      }

      if (transactionId) {
        const transaction = await tx.transaction.findUnique({
          where: { id: transactionId },
          select: { stockAccountId: true },
        });
        if (!transaction) throw new Error("TRANSAKSI_TIDAK_DITEMUKAN");
        if (transaction.stockAccountId) throw new Error("TRANSAKSI_SUDAH_DIALOKASIKAN");
      }

      const newUsedSlots = stockAccount.used_slots + 1;
      await tx.stockAccount.update({
        where: { id },
        data: {
          usedSlots: newUsedSlots,
          status: newUsedSlots >= stockAccount.max_slots ? "sold" : "available",
        },
      });

      if (transactionId) {
        await tx.transaction.update({
          where: { id: transactionId },
          data: { stockAccountId: id },
        });
      }

      return { usedSlots: newUsedSlots, maxSlots: stockAccount.max_slots };
    });

    return NextResponse.json({
      success: true,
      message: "Akun stok berhasil dialokasikan",
      slots: allocation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "AKUN_TIDAK_DITEMUKAN") {
      return NextResponse.json({ error: "Akun stok tidak ditemukan" }, { status: 404 });
    }
    if (message === "SLOT_PENUH") {
      return NextResponse.json({ error: "Slot akun sudah penuh" }, { status: 409 });
    }
    if (message === "TRANSAKSI_TIDAK_DITEMUKAN") {
      return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    }
    if (message === "TRANSAKSI_SUDAH_DIALOKASIKAN") {
      return NextResponse.json({ error: "Transaksi sudah memiliki akun stok" }, { status: 409 });
    }
    console.error("POST /api/stock/[id]/use error:", error);
    return NextResponse.json({ error: "Gagal mengalokasikan akun stok" }, { status: 500 });
  }
}
