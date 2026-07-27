import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccountDatabase1761000001000 implements MigrationInterface {
  name = 'CreateAccountDatabase1761000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE SEQUENCE account_number_seq START WITH 100000000001;

      CREATE TYPE account_type_enum AS ENUM ('savings', 'current', 'fixed');
      CREATE TYPE account_currency_enum AS ENUM ('USD', 'EUR', 'GBP');
      CREATE TYPE account_status_enum AS ENUM ('active', 'frozen', 'closed');
      CREATE TYPE kyc_status_enum AS ENUM ('pending', 'approved', 'rejected');

      CREATE TABLE accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        account_number VARCHAR(32) NOT NULL UNIQUE
          DEFAULT ('ACC' || lpad(nextval('account_number_seq')::text, 12, '0')),
        type account_type_enum NOT NULL,
        currency account_currency_enum NOT NULL,
        balance DECIMAL(18,4) NOT NULL DEFAULT 0,
        status account_status_enum NOT NULL DEFAULT 'active',
        kyc_status kyc_status_enum NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_accounts_balance_scale CHECK (balance = round(balance, 4))
      );

      CREATE TABLE account_limits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
        daily_transfer_limit DECIMAL(18,4) NOT NULL,
        single_txn_limit DECIMAL(18,4) NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_account_limits_daily_nonnegative CHECK (daily_transfer_limit >= 0),
        CONSTRAINT chk_account_limits_single_nonnegative CHECK (single_txn_limit >= 0),
        CONSTRAINT chk_account_limits_single_lte_daily
          CHECK (single_txn_limit <= daily_transfer_limit)
      );

      CREATE TABLE beneficiaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        name VARCHAR(160) NOT NULL,
        bank_code VARCHAR(32) NOT NULL,
        beneficiary_account_number VARCHAR(64) NOT NULL,
        is_verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );

      CREATE INDEX idx_accounts_user_id ON accounts(user_id);
      CREATE INDEX idx_accounts_account_number ON accounts(account_number);
      CREATE INDEX idx_accounts_status ON accounts(status);
      CREATE INDEX idx_beneficiaries_account_id ON beneficiaries(account_id);

      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO account_service;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO account_service;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS beneficiaries;
      DROP TABLE IF EXISTS account_limits;
      DROP TABLE IF EXISTS accounts;
      DROP TYPE IF EXISTS kyc_status_enum;
      DROP TYPE IF EXISTS account_status_enum;
      DROP TYPE IF EXISTS account_currency_enum;
      DROP TYPE IF EXISTS account_type_enum;
      DROP SEQUENCE IF EXISTS account_number_seq;
    `);
  }
}
