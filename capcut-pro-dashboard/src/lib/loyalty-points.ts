import { Prisma, PrismaClient } from "@prisma/client";

export const POINTS_PER_NEW_CUSTOMER = 3;
export const RUPIAH_PER_POINT = 1_000;
export const MIN_WITHDRAW_POINTS = 30;
export const MAX_WITHDRAW_POINTS = 1_000;

export const POINT_LEDGER_ACTIVE_STATUSES = ["available", "held", "spent"] as const;

export function pointsToRupiah(points: number) {
  return Math.max(0, Math.trunc(points)) * RUPIAH_PER_POINT;
}

export function normalizeWhatsapp(value: string | null | undefined) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  if (digits && !digits.startsWith("62")) digits = `62${digits}`;
  return digits;
}

export function phoneVariants(value: string | null | undefined) {
  const normalized = normalizeWhatsapp(value);
  if (!normalized) return [];
  const local = normalized.startsWith("62") ? `0${normalized.slice(2)}` : normalized;
  return Array.from(new Set([normalized, `+${normalized}`, local]));
}

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function getPointSummary(affiliateId: string, db: DbClient) {
  const rows = await db.affiliatePointLedger.findMany({
    where: { affiliateId, status: { in: [...POINT_LEDGER_ACTIVE_STATUSES] } },
    select: { points: true, status: true },
  });
  const availablePoints = rows
    .filter(row => row.status === "available")
    .reduce((sum, row) => sum + row.points, 0);
  const pendingPoints = rows
    .filter(row => row.status === "held")
    .reduce((sum, row) => sum + Math.abs(row.points), 0);
  return {
    availablePoints: Math.max(0, availablePoints),
    pendingPoints,
    totalPointsEarned: rows.filter(row => row.points > 0).reduce((sum, row) => sum + row.points, 0),
    availableRupiah: pointsToRupiah(availablePoints),
    pendingRupiah: pointsToRupiah(pendingPoints),
  };
}

export async function creditReferralReward(
  tx: Prisma.TransactionClient,
  input: { affiliateId: string | null | undefined; userId: string; transactionId: string },
) {
  if (!input.affiliateId) return { credited: false, points: 0 };

  const affiliate = await tx.affiliate.findUnique({
    where: { id: input.affiliateId },
    select: { id: true, status: true },
  });
  if (!affiliate || affiliate.status !== "active") return { credited: false, points: 0 };

  const user = await tx.user.findUnique({
    where: { id: input.userId },
    select: { id: true, referredBy: true },
  });
  if (!user || user.referredBy !== input.affiliateId) return { credited: false, points: 0 };

  const previousSuccessfulOrders = await tx.transaction.count({
    where: {
      userId: input.userId,
      status: "success",
      id: { not: input.transactionId },
    },
  });
  if (previousSuccessfulOrders > 0) return { credited: false, points: 0 };

  const existingReward = await tx.affiliatePointLedger.findFirst({
    where: {
      affiliateId: input.affiliateId,
      transactionId: input.transactionId,
      type: "referral_reward",
    },
    select: { id: true },
  });
  if (existingReward) return { credited: false, points: 0 };

  await tx.affiliatePointLedger.create({
    data: {
      affiliateId: input.affiliateId,
      userId: input.userId,
      transactionId: input.transactionId,
      points: POINTS_PER_NEW_CUSTOMER,
      type: "referral_reward",
      status: "available",
      note: "Reward customer baru dengan transaksi sukses",
    },
  });

  return { credited: true, points: POINTS_PER_NEW_CUSTOMER };
}
