/**
 * Shared phone normalization retained because checkout customer matching uses it.
 * Legacy Affiliate rewards themselves remain disabled after the Member migration.
 */
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

export async function creditReferralReward(
  _tx: unknown,
  _input: { affiliateId: string | null | undefined; userId: string; transactionId: string },
) {
  return { credited: false, points: 0 };
}
