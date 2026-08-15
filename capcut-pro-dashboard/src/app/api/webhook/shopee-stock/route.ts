import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { calcWarrantyExpiry } from "@/lib/duration";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type LockedStock = {
  id: string;
  account_email: string;
  account_password: string;
  used_slots: number;
  max_slots: number;
};

function isAuthorized(req: NextRequest) {
  const expected = process.env.SHOPEE_STOCK_WEBHOOK_SECRET;
  const received = req.headers.get("x-webhook-secret");

  if (!expected || !received) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function normalizeWhatsapp(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  if (!digits.startsWith("62")) digits = `62${digits}`;
  return digits;
}

/**
 * POST /api/webhook/shopee-stock
 *
 * Atomically reserves one stock slot for a Shopee/WhatsApp order before
 * returning account credentials. The orderId is the idempotency key.
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
    const {
      orderId,
      customerName = "Shopee Customer",
      customerWhatsapp,
      customerEmail,
      productId,
      productName,
      amount = 0,
    } = body;

    if (!orderId || !customerWhatsapp || (!productId && !productName)) {
      return NextResponse.json(
        { error: "orderId, customerWhatsapp, dan productId/productName wajib diisi" },
        { status: 400 },
      );
    }

    const cleanOrderId = String(orderId).trim();
    if (!cleanOrderId || cleanOrderId.length > 200) {
      return NextResponse.json({ error: "orderId tidak valid" }, { status: 400 });
    }

    const whatsapp = normalizeWhatsapp(String(customerWhatsapp));
    if (whatsapp.length < 10 || whatsapp.length > 16) {
      return NextResponse.json({ error: "Nomor WhatsApp tidak valid" }, { status: 400 });
    }

    const product = productId
      ? await prisma.product.findUnique({ where: { id: String(productId) } })
      : await prisma.product.findFirst({
          where: {
            name: { contains: String(productName).trim(), mode: "insensitive" },
            isActive: true,
          },
          orderBy: { sortOrder: "asc" },
        });

    if (!product) {
      return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 404 });
    }

    const reference = `shopee:${cleanOrderId}`;
    const email = customerEmail
      ? String(customerEmail).trim().toLowerCase()
      : `${whatsapp}@whatsapp.local`;

    const result = await prisma.$transaction(async (tx) => {
      // Serialize duplicate callbacks for the same Shopee order.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${reference}))`;

      const existing = await tx.transaction.findUnique({
        where: { lynkIdRef: reference },
        include: { stockAccount: true },
      });

      if (existing) {
        if (!existing.stockAccount) {
          throw new Error("ORDER_TANPA_STOK");
        }

        return {
          allocated: false,
          transactionId: existing.id,
          account: existing.stockAccount,
        };
      }

      // Lock one available account row. SKIP LOCKED prevents two simultaneous
      // customers from receiving the same last slot.
      const accounts = await tx.$queryRaw<LockedStock[]>`
        SELECT
          id,
          account_email,
          account_password,
          COALESCE(used_slots, 0)::int AS used_slots,
          COALESCE(max_slots, ${product.maxSlots ?? 3})::int AS max_slots
        FROM stock_accounts
        WHERE product_id = ${product.id}::uuid
          AND usage_type = 'sale'
          AND status = 'available'
          AND COALESCE(used_slots, 0) < COALESCE(max_slots, ${product.maxSlots ?? 3})
        ORDER BY COALESCE(used_slots, 0) DESC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;

      const account = accounts[0];
      if (!account) throw new Error("STOK_KOSONG");

      const user = await tx.user.upsert({
        where: { email },
        update: {
          name: String(customerName).trim() || "Shopee Customer",
          whatsapp,
        },
        create: {
          email,
          name: String(customerName).trim() || "Shopee Customer",
          whatsapp,
          customerType: "new",
        },
      });

      const purchaseDate = new Date();
      const warrantyExpiredAt = calcWarrantyExpiry(
        purchaseDate,
        product.duration ?? 30,
      );
      const newUsedSlots = account.used_slots + 1;

      const transaction = await tx.transaction.create({
        data: {
          lynkIdRef: reference,
          userId: user.id,
          stockAccountId: account.id,
          productId: product.id,
          productName: product.name,
          amount: Math.max(0, Number(amount) || 0),
          status: "success",
          source: "shopee-whatsapp",
          purchaseDate,
          warrantyExpiredAt,
        },
      });

      await tx.stockAccount.update({
        where: { id: account.id },
        data: {
          usedSlots: newUsedSlots,
          status: newUsedSlots >= account.max_slots ? "sold" : "available",
        },
      });

      return {
        allocated: true,
        transactionId: transaction.id,
        account: {
          id: account.id,
          accountEmail: account.account_email,
          accountPassword: account.account_password,
          usedSlots: newUsedSlots,
          maxSlots: account.max_slots,
        },
      };
    });

    const account = result.account;
    const usedSlots = account.usedSlots ?? 0;
    const maxSlots = account.maxSlots ?? product.maxSlots ?? 3;

    return NextResponse.json({
      success: true,
      allocated: result.allocated,
      transactionId: result.transactionId,
      orderId: cleanOrderId,
      product: product.name,
      account: {
        email: account.accountEmail,
        password: account.accountPassword,
      },
      slots: {
        used: usedSlots,
        max: maxSlots,
        remaining: Math.max(0, maxSlots - usedSlots),
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

    console.error("[Shopee Stock] Allocation error:", error);
    return NextResponse.json({ error: "Gagal mengalokasikan akun" }, { status: 500 });
  }
}
