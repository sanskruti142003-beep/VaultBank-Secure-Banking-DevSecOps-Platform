import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentDatabase1761000003000 implements MigrationInterface {
  name = 'CreatePaymentDatabase1761000003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TYPE payment_gateway_enum AS ENUM ('stripe', 'paypal', 'bank_transfer');
      CREATE TYPE payment_status_enum AS ENUM ('initiated', 'processing', 'success', 'failed', 'refunded');
      CREATE TYPE refund_status_enum AS ENUM ('pending', 'approved', 'rejected', 'completed');
      CREATE TABLE payment_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        transaction_id UUID,
        from_account_id UUID NOT NULL,
        to_account_id UUID NOT NULL,
        gateway payment_gateway_enum NOT NULL,
        gateway_reference VARCHAR(255),
        amount DECIMAL(18,4) NOT NULL CHECK (amount > 0),
        currency CHAR(3) NOT NULL,
        status payment_status_enum NOT NULL DEFAULT 'initiated',
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE payment_receipts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_order_id UUID NOT NULL UNIQUE REFERENCES payment_orders(id) ON DELETE RESTRICT,
        receipt_number VARCHAR(40) NOT NULL UNIQUE,
        issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        pdf_url TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE refunds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_order_id UUID NOT NULL REFERENCES payment_orders(id) ON DELETE RESTRICT,
        amount DECIMAL(18,4) NOT NULL CHECK (amount > 0),
        reason TEXT NOT NULL,
        status refund_status_enum NOT NULL DEFAULT 'pending',
        requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE INDEX idx_payment_orders_user_id ON payment_orders(user_id);
      CREATE INDEX idx_payment_orders_transaction_id ON payment_orders(transaction_id);
      CREATE INDEX idx_payment_orders_gateway_reference ON payment_orders(gateway_reference);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS refunds;
      DROP TABLE IF EXISTS payment_receipts;
      DROP TABLE IF EXISTS payment_orders;
      DROP TYPE IF EXISTS refund_status_enum;
      DROP TYPE IF EXISTS payment_status_enum;
      DROP TYPE IF EXISTS payment_gateway_enum;
    `);
  }
}
