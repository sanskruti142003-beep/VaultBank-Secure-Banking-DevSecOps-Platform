import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccountDatabase1761000001000 implements MigrationInterface {
  name = 'CreateAccountDatabase1761000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TYPE account_type_enum AS ENUM ('savings', 'current', 'fixed');
      CREATE TYPE account_currency_enum AS ENUM ('USD', 'EUR', 'GBP');
      CREATE TYPE account_status_enum AS ENUM ('active', 'frozen', 'closed');
      CREATE TYPE kyc_status_enum AS ENUM ('pending', 'approved', 'rejected');
      CREATE TABLE accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        account_number VARCHAR(32) NOT NULL UNIQUE,
        type account_type_enum NOT NULL,
        currency account_currency_enum NOT NULL,
        balance DECIMAL(18,4) NOT NULL DEFAULT 0,
        status account_status_enum NOT NULL DEFAULT 'active',
        kyc_status kyc_status_enum NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE account_limits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
        daily_transfer_limit DECIMAL(18,4) NOT NULL,
        single_txn_limit DECIMAL(18,4) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CHECK (daily_transfer_limit >= 0),
        CHECK (single_txn_limit >= 0),
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
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE INDEX idx_accounts_user_id ON accounts(user_id);
      CREATE INDEX idx_accounts_account_number ON accounts(account_number);
      CREATE INDEX idx_accounts_status ON accounts(status);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS beneficiaries;
      DROP TABLE IF EXISTS account_limits;
      DROP TABLE IF EXISTS accounts;
      DROP TYPE IF EXISTS kyc_status_enum;
      DROP TYPE IF EXISTS account_status_enum;
      DROP TYPE IF EXISTS account_currency_enum;
      DROP TYPE IF EXISTS account_type_enum;
    `);
  }
}
