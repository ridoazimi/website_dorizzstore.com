import { PrismaClient } from "@prisma/client";
import { calcWarrantyExpiry } from "@/lib/duration";

export type ShopeeStockInput = {
  orderId: string;
  customerName?: string;
  customerWhatsapp?: string;
  customerEmail?: string;
  customerId?: string;
  productId?: string;
  productName?: string;
  productType?: string;
  amount?: number | string;
};

type LockedStock = {
  id: string;
  account_email: string;
  account_password: string;
  product_id: string | null;
  product_name: string | null;
  duration: number | null;
  used_slots: number;
  max_slots: number;
};

type AllocationResult = {
  allocated: boolean;
  transactionId: string;
  account: {
    id: string;
    accountEmail: string;
    accountPassword: string;
    usedSlots: number;
    maxSlots: number;
  };
  productName: string;
};

export function normalizeWhatsapp(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  if (!digits.startsWith("62")) digits = `62${digits}`;
  return digits;
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cleanOptional(value: unknown) {
  const cleaned = String(value ?? "").trim();
  return cleaned || undefined;
}

export async function allocateShopeeStock(
  prisma: PrismaClient,
  input: ShopeeStockInput,
): Promise<AllocationResult> {
  const orderId = String(input.orderId ?? "").trim();
  if (!orderId || orderId.length > 200) throw new Error("ORDER_ID_TIDAK_VALID");

  const customerId = cleanOptional(input.customerId);
  const rawWhatsapp = cleanOptional(input.customerWhatsapp);
  if (!customerId && !rawWhatsapp) throw new Error("CUSTOMER_TIDAK_VALID");
  if (customerId && !isValidUuid(customerId)) throw new Error("CUSTOMER_ID_TIDAK_VALID");

  const whatsapp = rawWhatsapp ? normalizeWhatsapp(rawWhatsapp) : undefined;
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 16)) {
    throw new Error("WHATSAPP_TIDAK_VALID");
  }

  const productId = cleanOptional(input.productId);
  if (productId && !isValidUuid(productId)) throw new Error("PRODUCT_ID_TIDAK_VALID");
  const productName = cleanOptional(input.productName);
  const productType = cleanOptional(input.productType) || "mobile";
  const productIdParam = productId ?? null;
  const productNameParam = productName ?? null;
  const reference = `shopee:${orderId}`;
  const email = cleanOptional(input.customerEmail)?.toLowerCase()
    || (whatsapp ? `${whatsapp}@whatsapp.local` : undefined);
  const displayName = cleanOptional(input.customerName) || "Shopee Customer";
  const amount = Math.max(0, Number(input.amount) || 0);

  return prisma.$transaction(async (tx) => {
    // The advisory lock makes retries for one Shopee order idempotent even when
    // callbacks arrive concurrently on different application workers.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${reference}))`;

    const existing = await tx.transaction.findUnique({
      where: { lynkIdRef: reference },
      include: { stockAccount: true, product: true },
    });

    if (existing) {
      if (!existing.stockAccount) throw new Error("ORDER_TANPA_STOK");
      return {
        allocated: false,
        transactionId: existing.id,
        productName: existing.productName || existing.product?.name || productName || "CapCut Pro",
        account: {
          id: existing.stockAccount.id,
          accountEmail: existing.stockAccount.accountEmail,
          accountPassword: existing.stockAccount.accountPassword,
          usedSlots: existing.stockAccount.usedSlots ?? 0,
          maxSlots: existing.stockAccount.maxSlots ?? 3,
        },
      };
    }

    const accounts = await tx.$queryRaw<LockedStock[]>`
      SELECT
        sa.id,
        sa.account_email,
        sa.account_password,
        sa.product_id,
        p.name AS product_name,
        p.duration,
        GREATEST(
          COALESCE(sa.used_slots, 0),
          COALESCE(success_usage.transaction_count, 0)
            + COALESCE(legacy_usage.allocation_count, 0)
        )::int AS used_slots,
        COALESCE(sa.max_slots, COALESCE(p.max_slots, 3))::int AS max_slots
      FROM stock_accounts sa
      LEFT JOIN products p ON p.id = sa.product_id
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
      WHERE sa.usage_type = 'sale'
        AND sa.status = 'available'
        AND GREATEST(
          COALESCE(sa.used_slots, 0),
          COALESCE(success_usage.transaction_count, 0)
            + COALESCE(legacy_usage.allocation_count, 0)
        ) < COALESCE(sa.max_slots, COALESCE(p.max_slots, 3))
        AND (${productIdParam}::uuid IS NULL OR sa.product_id = ${productIdParam}::uuid)
        AND (${productIdParam}::uuid IS NOT NULL OR ${productNameParam}::text IS NULL OR p.name ILIKE ${`%${productName || ""}%`})
        AND (${productIdParam}::uuid IS NOT NULL OR ${productNameParam}::text IS NOT NULL OR sa.product_type = ${productType})
      ORDER BY used_slots DESC, sa.created_at ASC
      FOR UPDATE OF sa SKIP LOCKED
      LIMIT 1
    `;

    const account = accounts[0];
    if (!account) throw new Error("STOK_KOSONG");

    const user = customerId
      ? await tx.user.findUnique({ where: { id: customerId } })
      : email
        ? await tx.user.upsert({
            where: { email },
            update: {
              name: displayName,
              ...(whatsapp ? { whatsapp } : {}),
            },
            create: {
              email,
              name: displayName,
              whatsapp,
              customerType: "new",
            },
          })
        : null;

    if (!user) throw new Error("CUSTOMER_TIDAK_DITEMUKAN");

    if (customerId && whatsapp) {
      await tx.user.update({ where: { id: user.id }, data: { whatsapp } });
    }

    const resolvedProductName = account.product_name || productName || "CapCut Pro";
    const purchaseDate = new Date();
    const warrantyExpiredAt = calcWarrantyExpiry(
      purchaseDate,
      account.duration ?? 30,
    );
    const newUsedSlots = account.used_slots + 1;

    const transaction = await tx.transaction.create({
      data: {
        lynkIdRef: reference,
        userId: user.id,
        stockAccountId: account.id,
        productId: account.product_id,
        productName: resolvedProductName,
        amount,
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

    await tx.$executeRaw`
      INSERT INTO stock_allocations
        (stock_account_id, customer_id, order_id, status, created_at)
      VALUES
        (${account.id}::uuid, ${user.id}::uuid, ${orderId}, 'active', now())
    `;

    return {
      allocated: true,
      transactionId: transaction.id,
      productName: resolvedProductName,
      account: {
        id: account.id,
        accountEmail: account.account_email,
        accountPassword: account.account_password,
        usedSlots: newUsedSlots,
        maxSlots: account.max_slots,
      },
    };
  });
}

