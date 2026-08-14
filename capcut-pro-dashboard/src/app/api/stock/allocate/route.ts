import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Automatic stock allocator for bot/order integrations.
// Returns one account with an available slot and increments usage atomically.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const productType = String(body.productType || "mobile");
    const customerId = body.customerId ? String(body.customerId) : null;
    const orderId = body.orderId ? String(body.orderId) : null;

    const allocated = await prisma.$transaction(async (tx) => {
      const accounts = await tx.$queryRaw<Array<{
        id: string;
        account_email: string;
        account_password: string;
      }>>`
        SELECT id, account_email, account_password
        FROM stock_accounts
        WHERE status = 'available'
          AND product_type = ${productType}
          AND COALESCE(used_slots, 0) < COALESCE(max_slots, 3)
        ORDER BY used_slots ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;

      const account = accounts[0];
      if (!account) return null;

      await tx.$executeRaw`
        UPDATE stock_accounts
        SET used_slots = COALESCE(used_slots, 0) + 1,
            updated_at = now()
        WHERE id = ${account.id}::uuid
      `;

      await tx.$executeRaw`
        INSERT INTO stock_allocations
          (stock_account_id, customer_id, order_id, status, created_at)
        VALUES
          (${account.id}::uuid, ${customerId}::uuid, ${orderId}, 'active', now())
      `;

      return account;
    });

    if (!allocated) {
      return NextResponse.json({ error: "Stok akun dengan slot tersedia tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      account: {
        email: allocated.account_email,
        password: allocated.account_password,
      },
    });
  } catch (error) {
    console.error("Stock allocation error", error);
    return NextResponse.json({ error: "Gagal mengambil stok akun" }, { status: 500 });
  }
}
