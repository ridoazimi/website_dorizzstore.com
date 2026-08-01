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

    const stockAccount = await prisma.stockAccount.findUnique({
      where: { id },
    });

    if (!stockAccount) {
      return NextResponse.json({ error: "Akun stok tidak ditemukan" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      const maxSlots = stockAccount.maxSlots ?? 3;
      const newUsedSlots = (stockAccount.usedSlots ?? 0) + 1;

      // 1. Update stock account usedSlots & status
      await tx.stockAccount.update({
        where: { id },
        data: {
          usedSlots: newUsedSlots,
          status: newUsedSlots >= maxSlots ? "sold" : "available",
        },
      });

      // 2. Hubungkan akun stok ke transaksi jika transactionId diberikan
      if (transactionId) {
        await tx.transaction.update({
          where: { id: transactionId },
          data: {
            stockAccountId: id,
          },
        });
      }
    });

    return NextResponse.json({ success: true, message: "Akun stok berhasil dialokasikan" });
  } catch (error) {
    console.error("POST /api/stock/[id]/use error:", error);
    return NextResponse.json({ error: "Gagal mengalokasikan akun stok" }, { status: 500 });
  }
}
