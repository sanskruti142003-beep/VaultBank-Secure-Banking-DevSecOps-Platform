CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SEQUENCE transaction_reference_seq START WITH 1;

CREATE TYPE transaction_type_enum AS ENUM ('transfer', 'deposit', 'withdrawal');
CREATE TYPE transaction_status_enum AS ENUM (
  'pending', 'processing', 'completed', 'failed', 'reversed'
);
CREATE TYPE ledger_entry_type_enum AS ENUM ('debit', 'credit');

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference VARCHAR(40) NOT NULL UNIQUE DEFAULT (
    'TXN' || to_char(CURRENT_DATE, 'YYYYMMDD')
    || lpad(nextval('transaction_reference_seq')::text, 12, '0')
  ),
  from_account_id UUID,
  to_account_id UUID,
  amount DECIMAL(18,4) NOT NULL,
  currency CHAR(3) NOT NULL,
  type transaction_type_enum NOT NULL,
  status transaction_status_enum NOT NULL DEFAULT 'pending',
  description TEXT,
  metadata JSONB,
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT chk_transactions_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_transactions_currency CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT chk_transactions_accounts_for_type CHECK (
    (type = 'transfer' AND from_account_id IS NOT NULL
      AND to_account_id IS NOT NULL AND from_account_id <> to_account_id)
    OR (type = 'deposit' AND to_account_id IS NOT NULL)
    OR (type = 'withdrawal' AND from_account_id IS NOT NULL)
  ),
  CONSTRAINT chk_transactions_completion_time
    CHECK (completed_at IS NULL OR completed_at >= initiated_at)
);

CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL,
  entry_type ledger_entry_type_enum NOT NULL,
  amount DECIMAL(18,4) NOT NULL,
  balance_after DECIMAL(18,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_ledger_entries_amount_positive CHECK (amount > 0)
);

CREATE TABLE transaction_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  fee_type VARCHAR(64) NOT NULL,
  amount DECIMAL(18,4) NOT NULL,
  currency CHAR(3) NOT NULL,
  CONSTRAINT chk_transaction_fees_amount_nonnegative CHECK (amount >= 0),
  CONSTRAINT chk_transaction_fees_currency CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX idx_transactions_from_account_id ON transactions(from_account_id);
CREATE INDEX idx_transactions_to_account_id ON transactions(to_account_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_initiated_at ON transactions(initiated_at);
CREATE INDEX idx_ledger_entries_account_id ON ledger_entries(account_id);
CREATE INDEX idx_ledger_entries_transaction_id ON ledger_entries(transaction_id);
CREATE INDEX idx_transaction_fees_transaction_id ON transaction_fees(transaction_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO transaction_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO transaction_service;
