import { Prisma, PrismaClient } from "@prisma/client";
import { phoneVariants } from "@/lib/loyalty-points";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function findExistingCustomer(
  db: DbClient,
  email: string | null | undefined,
  whatsapp: string | null | undefined,
) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const variants = phoneVariants(whatsapp);
  const clauses: Prisma.UserWhereInput[] = [];

  if (normalizedEmail) {
    clauses.push({ email: { equals: normalizedEmail, mode: "insensitive" } });
  }
  if (variants.length > 0) {
    clauses.push({ whatsapp: { in: variants } });
  }
  if (clauses.length === 0) return null;

  return db.user.findFirst({
    where: { OR: clauses },
    orderBy: { createdAt: "asc" },
  });
}

export function getGeneralCheckoutPath(slug: string | null | undefined) {
  const checkoutPath = `/checkout/${encodeURIComponent(slug || "")}`;
  return `/api/referral/clear?redirect=${encodeURIComponent(checkoutPath)}`;
}
