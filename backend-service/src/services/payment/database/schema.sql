CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SEQUENCE receipt_number_seq START WITH 1;

CREATE TYPE payment_gateway_enum AS ENUM ('stripe', 'paypal', 'bank_transfer');
CREATE TYPE payment_status_enum AS ENUM (
  'initiated', 'processing', 'success', 'failed', 'refunded'
);
CREATE TYPE refund_status_enum AS ENUM (
  'pending', 'approved', 'rejected', 'completed'
);

CREATE TABLE payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL,
  gateway payment_gateway_enum NOT NULL,
  gateway_reference VARCHAR(255),
  amount DECIMAL(18,4) NOT NULL,
  currency CHAR(3) NOT NULL,
  status payment_status_enum NOT NULL DEFAULT 'initiated',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_payment_orders_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_payment_orders_currency CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE TABLE payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_order_id UUID NOT NULL UNIQUE
    REFERENCES payment_orders(id) ON DELETE RESTRICT,
  receipt_number VARCHAR(40) NOT NULL UNIQUE DEFAULT (
    'RCP' || to_char(CURRENT_DATE, 'YYYYMMDD')
    || lpad(nextval('receipt_number_seq')::text, 12, '0')
  ),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pdf_url TEXT NOT NULL
);

CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_order_id UUID NOT NULL REFERENCES payment_orders(id) ON DELETE RESTRICT,
  amount DECIMAL(18,4) NOT NULL,
  reason TEXT NOT NULL,
  status refund_status_enum NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT chk_refunds_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_refunds_resolution_time
    CHECK (resolved_at IS NULL OR resolved_at >= requested_at)
);

CREATE INDEX idx_payment_orders_transaction_id ON payment_orders(transaction_id);
CREATE INDEX idx_payment_orders_gateway_reference ON payment_orders(gateway_reference);
CREATE INDEX idx_refunds_payment_order_id ON refunds(payment_order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO payment_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO payment_service;
