/**
 * Legacy compatibility shim.
 * Affiliate rewards were retired when DorizzStore migrated to Member.
 * Older webhook code may still import this function during the transition,
 * but it must never create Affiliate points or balances again.
 */
export async function creditReferralReward(
  _tx: unknown,
  _input: { affiliateId: string | null | undefined; userId: string; transactionId: string },
) {
  return { credited: false, points: 0 };
}
