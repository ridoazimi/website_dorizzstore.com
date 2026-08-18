import { Prisma } from "@prisma/client";

/**
 * Legacy compatibility shim.
 * Affiliate rewards were retired when DorizzStore migrated to Member.
 * Kept temporarily because older webhook code still imports this function.
 * Member rewards are handled by the Member attribution/ledger flow instead.
 */
export async function creditReferralReward(
  _tx: Prisma.TransactionClient,
  _input: { affiliateId: string | null | undefined; userId: string; transactionId: string },
) {
  return { credited: false, points: 0, legacyAffiliateDisabled: true };
}
