-- Loyalty Member Point ledger and withdrawal fields.
-- This migration is intentionally idempotent for the existing production schema.

ALTER TABLE affiliate_withdrawals
  ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS method VARCHAR(30) DEFAULT 'bank_transfer',
  ADD COLUMN IF NOT EXISTS account_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS account_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS payout_reference VARCHAR(255);

CREATE TABLE IF NOT EXISTS affiliate_point_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  withdrawal_id UUID REFERENCES affiliate_withdrawals(id) ON DELETE SET NULL,
  points INTEGER NOT NULL,
  type VARCHAR(40) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'available',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_point_ledger_reward_tx_unique
  ON affiliate_point_ledger(affiliate_id, transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS affiliate_point_ledger_affiliate_created_idx
  ON affiliate_point_ledger(affiliate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS affiliate_point_ledger_withdrawal_idx
  ON affiliate_point_ledger(withdrawal_id);
