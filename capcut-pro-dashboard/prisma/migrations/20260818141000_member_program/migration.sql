-- DorizzStore Member program
-- Scope intentionally excludes Sales Creator (sales_teams, sales_id, sales_code).

CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  whatsapp VARCHAR(50),
  password VARCHAR(255) NOT NULL,
  referral_code VARCHAR(12) NOT NULL UNIQUE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS members_status_idx ON members(status);
CREATE INDEX IF NOT EXISTS members_joined_at_idx ON members(joined_at DESC);

CREATE TABLE IF NOT EXISTS member_terms_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  terms_version VARCHAR(40) NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address VARCHAR(100),
  user_agent TEXT,
  UNIQUE(member_id, terms_version)
);

CREATE TABLE IF NOT EXISTS member_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO member_settings(key, value) VALUES
  ('referral_points', '3'::jsonb),
  ('point_value_rupiah', '3000'::jsonb),
  ('minimum_withdraw_points', '30'::jsonb),
  ('referral_window_days', '30'::jsonb),
  ('terms_version', '"1"'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS member_referral_id UUID REFERENCES members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS member_referral_code VARCHAR(12),
  ADD COLUMN IF NOT EXISTS member_referral_attributed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS transactions_member_referral_idx
  ON transactions(member_referral_id, created_at DESC);

CREATE TABLE IF NOT EXISTS member_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'success',
  is_new_customer BOOLEAN NOT NULL DEFAULT false,
  is_self_referral BOOLEAN NOT NULL DEFAULT false,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS member_referrals_member_created_idx
  ON member_referrals(member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS member_point_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  source_type VARCHAR(50) NOT NULL,
  source_id UUID,
  points INTEGER NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'available',
  note TEXT,
  actor_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS member_point_ledger_referral_tx_unique
  ON member_point_ledger(member_id, transaction_id)
  WHERE source_type = 'referral_reward' AND transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS member_point_ledger_member_created_idx
  ON member_point_ledger(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS member_point_ledger_source_idx
  ON member_point_ledger(source_type, source_id);

CREATE TABLE IF NOT EXISTS member_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  points_required INTEGER NOT NULL CHECK (points_required > 0),
  fulfillment_type VARCHAR(40) NOT NULL DEFAULT 'manual',
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  fulfillment_notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS member_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES member_rewards(id) ON DELETE RESTRICT,
  points INTEGER NOT NULL CHECK (points > 0),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  voucher_code VARCHAR(50),
  rejection_reason TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES admin_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS member_redemptions_member_created_idx
  ON member_redemptions(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS member_redemptions_status_idx
  ON member_redemptions(status, created_at);

CREATE TABLE IF NOT EXISTS member_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  points INTEGER NOT NULL CHECK (points > 0),
  point_value_rupiah INTEGER NOT NULL CHECK (point_value_rupiah > 0),
  amount_rupiah BIGINT NOT NULL CHECK (amount_rupiah > 0),
  method VARCHAR(50) NOT NULL,
  account_number VARCHAR(100) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES admin_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS member_withdrawals_member_created_idx
  ON member_withdrawals(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS member_withdrawals_status_idx
  ON member_withdrawals(status, created_at);

CREATE TABLE IF NOT EXISTS member_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_notifications_member_created_idx
  ON member_notifications(member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS member_admin_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  reason TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_admin_activity_created_idx
  ON member_admin_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS member_admin_activity_member_idx
  ON member_admin_activity_log(member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS member_leaderboard_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  month_start DATE NOT NULL,
  month_end DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (month_end >= month_start)
);
CREATE INDEX IF NOT EXISTS member_leaderboard_campaigns_period_idx
  ON member_leaderboard_campaigns(month_start, month_end);

CREATE TABLE IF NOT EXISTS member_leaderboard_prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES member_leaderboard_campaigns(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank > 0),
  prize_name VARCHAR(255) NOT NULL,
  notes TEXT,
  UNIQUE(campaign_id, rank)
);

ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS member_redemption_id UUID REFERENCES member_redemptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reward_product_id UUID REFERENCES products(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vouchers_member_redemption_unique
  ON vouchers(member_redemption_id)
  WHERE member_redemption_id IS NOT NULL;
