import { prisma } from "@/lib/db";

const DAY_MS = 86_400_000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

type DurationTextFields = {
  name: string;
  slug: string | null;
  category: string | null;
  description: string | null;
  rules: string | null;
  messageTemplate: string | null;
};

function replaceDays(value: string | null, duration: number, slug = false) {
  if (!value) return value;

  if (slug) {
    return value.replace(/\b\d{1,3}-hari\b/gi, `${duration}-hari`);
  }

  return value.replace(/\b\d{1,3}\s*hari\b/gi, `${duration} Hari`);
}

export function applyDurationToProductFields(
  product: DurationTextFields,
  duration: number,
) {
  const safeDuration = Math.max(1, Math.trunc(duration || 1));

  return {
    duration: safeDuration,
    name: replaceDays(product.name, safeDuration) || product.name,
    slug: replaceDays(product.slug, safeDuration, true),
    category: replaceDays(product.category, safeDuration),
    description: replaceDays(product.description, safeDuration),
    rules: replaceDays(product.rules, safeDuration),
    messageTemplate: replaceDays(product.messageTemplate, safeDuration),
  };
}

function wibDayNumber(value: Date) {
  const wib = new Date(value.getTime() + WIB_OFFSET_MS);
  return Math.floor(
    Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) / DAY_MS,
  );
}

export function getRemainingStockDays(
  durationDays: number | null,
  createdAt: Date | string | null,
  now = new Date(),
) {
  const initialDuration = Math.max(1, durationDays ?? 30);
  if (!createdAt) return initialDuration;

  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return initialDuration;

  const elapsedCalendarDays = Math.max(0, wibDayNumber(now) - wibDayNumber(created));
  return Math.max(1, initialDuration - elapsedCalendarDays);
}

export async function syncProductDurationsFromAvailableStock(productIds?: string[]) {
  const stocks = await prisma.stockAccount.findMany({
    where: {
      status: "available",
      usageType: "sale",
      productId: productIds?.length ? { in: productIds } : { not: null },
    },
    select: {
      productId: true,
      durationDays: true,
      createdAt: true,
      usedSlots: true,
      maxSlots: true,
    },
  });

  const durationByProduct = new Map<string, number>();

  for (const stock of stocks) {
    if (!stock.productId) continue;
    if ((stock.usedSlots ?? 0) >= (stock.maxSlots ?? 3)) continue;

    const remaining = getRemainingStockDays(stock.durationDays, stock.createdAt);
    const current = durationByProduct.get(stock.productId);
    if (current === undefined || remaining < current) {
      durationByProduct.set(stock.productId, remaining);
    }
  }

  if (durationByProduct.size === 0) return;

  const products = await prisma.product.findMany({
    where: { id: { in: [...durationByProduct.keys()] } },
    select: {
      id: true,
      duration: true,
      name: true,
      slug: true,
      category: true,
      description: true,
      rules: true,
      messageTemplate: true,
    },
  });

  const updates = products.flatMap((product) => {
    const duration = durationByProduct.get(product.id);
    if (!duration || product.duration === duration) return [];

    return [
      prisma.product.update({
        where: { id: product.id },
        data: applyDurationToProductFields(product, duration),
      }),
    ];
  });

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
}
