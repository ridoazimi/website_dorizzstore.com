import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { allocateShopeeStock } from "@/lib/shopee-stock-allocation";

export const runtime = "nodejs";

function isAuthorized(req: NextRequest) {
  const expected = process.env.SHOPEE_STOCK_WEBHOOK_SECRET;
  const received = req.headers.get("x-webhook-secret");

  if (!expected || !received) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

/**
 * POST /api/webhook/shopee-stock
 *
 * Reserves one stock slot for a Shopee/WhatsApp order before returning the
 * account credentials. The Shopee order id is used as an idempotency key.
 */
export async function POST(req: NextRequest) {
  if (!process.env.SHOPEE_STOCK_WEBHOOK_SECRET) {
    console.error("[Shopee Stock] SHOPEE_STOCK_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook belum dikonfigurasi" }, { status: 503 });
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const result = await allocateShopeeStock(prisma, {
      orderId: body.orderId,
      customerName: body.customerName,
      customerWhatsapp: body.customerWhatsapp,
      customerEmail: body.customerEmail,
      customerId: body.customerId,
      productId: body.productId,
      productName: body.productName,
      productType: body.productType,
      amount: body.amount,
    });

    return NextResponse.json({
      success: true,
      allocated: result.allocated,
      transactionId: result.transactionId,
      orderId: String(body.orderId).trim(),
      product: result.productName,
      account: {
        email: result.account.accountEmail,
        password: result.account.accountPassword,
      },
      slots: {
        used: result.account.usedSlots,
        max: result.account.maxSlots,
        remaining: Math.max(0, result.account.maxSlots - result.account.usedSlots),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message === "STOK_KOSONG") {
      return NextResponse.json(
        { error: "Stok akun untuk produk ini kosong atau seluruh slot sudah penuh" },
        { status: 409 },
      );
    }
    if (message === "ORDER_TANPA_STOK") {
      return NextResponse.json(
        { error: "Order ini sudah tercatat tetapi belum memiliki akun stok" },
        { status: 409 },
      );
    }
    if ([
      "ORDER_ID_TIDAK_VALID",
      "CUSTOMER_TIDAK_VALID",
      "CUSTOMER_ID_TIDAK_VALID",
      "WHATSAPP_TIDAK_VALID",
      "PRODUCT_ID_TIDAK_VALID",
    ].includes(message)) {
      return NextResponse.json({ error: "Data order/customer tidak valid" }, { status: 400 });
    }
    if (message === "CUSTOMER_TIDAK_DITEMUKAN") {
      return NextResponse.json({ error: "Customer tidak ditemukan" }, { status: 404 });
    }

    console.error("[Shopee Stock] Allocation error:", error);
    return NextResponse.json({ error: "Gagal mengalokasikan akun" }, { status: 500 });
  }
}
