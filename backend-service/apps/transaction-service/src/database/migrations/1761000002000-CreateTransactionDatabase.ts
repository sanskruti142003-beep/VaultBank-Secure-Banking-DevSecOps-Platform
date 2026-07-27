import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionDatabase1761000002000 implements MigrationInterface {
  name = 'CreateTransactionDatabase1761000002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TYPE transaction_type_enum AS ENUM ('transfer', 'deposit', 'withdrawal');
      CREATE TYPE transaction_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed', 'reversed');
      CREATE TYPE ledger_entry_type_enum AS ENUM ('debit', 'credit');
      CREATE TABLE transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reference VARCHAR(40) NOT NULL UNIQUE,
        from_account_id UUID,
        to_account_id UUID,
        amount DECIMAL(18,4) NOT NULL CHECK (amount > 0),
        currency CHAR(3) NOT NULL,
        type transaction_type_enum NOT NULL,
        status transaction_status_enum NOT NULL DEFAULT 'pending',
        description TEXT,
        metadata JSONB,
        initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE ledger_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
        account_id UUID NOT NULL,
        entry_type ledger_entry_type_enum NOT NULL,
        amount DECIMAL(18,4) NOT NULL CHECK (amount > 0),
        balance_after DECIMAL(18,4) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE transaction_fees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
        fee_type VARCHAR(64) NOT NULL,
        amount DECIMAL(18,4) NOT NULL CHECK (amount >= 0),
        currency CHAR(3) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE INDEX idx_transactions_from_account_id ON transactions(from_account_id);
      CREATE INDEX idx_transactions_to_account_id ON transactions(to_account_id);
      CREATE INDEX idx_transactions_status ON transactions(status);
      CREATE INDEX idx_transactions_initiated_at ON transactions(initiated_at);
      CREATE INDEX idx_ledger_entries_account_id ON ledger_entries(account_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS transaction_fees;
      DROP TABLE IF EXISTS ledger_entries;
      DROP TABLE IF EXISTS transactions;
      DROP TYPE IF EXISTS ledger_entry_type_enum;
      DROP TYPE IF EXISTS transaction_status_enum;
      DROP TYPE IF EXISTS transaction_type_enum;
    `);
  }
}
