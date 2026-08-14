-- Track every automatic stock assignment
CREATE TABLE IF NOT EXISTS stock_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_account_id UUID NOT NULL REFERENCES stock_accounts(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  order_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_allocations_account_idx
ON stock_allocations(stock_account_id);

CREATE INDEX IF NOT EXISTS stock_allocations_customer_idx
ON stock_allocations(customer_id);
