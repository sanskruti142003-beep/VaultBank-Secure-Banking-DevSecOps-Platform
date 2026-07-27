import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserDatabase1761000000000 implements MigrationInterface {
  name = 'CreateUserDatabase1761000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE EXTENSION IF NOT EXISTS citext;
      CREATE TYPE role_name_enum AS ENUM ('admin', 'customer', 'agent');
      CREATE TYPE otp_purpose_enum AS ENUM ('login', 'reset_password', 'verify_email', 'account_delete', 'admin_login');

      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username CITEXT NOT NULL UNIQUE,
        email CITEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        phone VARCHAR(32),
        pan_number VARCHAR(10),
        full_name VARCHAR(160) NOT NULL,
        is_verified BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name role_name_enum NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE otp_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash VARCHAR(255) NOT NULL,
        purpose otp_purpose_enum NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE INDEX idx_users_email ON users(email);
      CREATE INDEX idx_users_username ON users(username);
      CREATE INDEX idx_users_phone_active
        ON users(phone)
        WHERE phone IS NOT NULL AND deleted_at IS NULL;
      CREATE UNIQUE INDEX uq_users_phone_active
        ON users((regexp_replace(phone, '[^0-9+]', '', 'g')))
        WHERE phone IS NOT NULL AND deleted_at IS NULL;
      CREATE UNIQUE INDEX uq_users_pan_number_active
        ON users(pan_number)
        WHERE pan_number IS NOT NULL AND deleted_at IS NULL;
      CREATE UNIQUE INDEX uq_user_roles_active
        ON user_roles(user_id, role_id) WHERE deleted_at IS NULL;
      CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
      CREATE INDEX idx_otp_codes_user_id ON otp_codes(user_id);

      CREATE OR REPLACE FUNCTION ensure_unique_active_user_phone()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.phone IS NULL OR NEW.deleted_at IS NOT NULL THEN
          RETURN NEW;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM users
          WHERE phone = NEW.phone
            AND deleted_at IS NULL
            AND id <> NEW.id
        ) THEN
          RAISE EXCEPTION 'Phone number is already registered'
            USING ERRCODE = 'unique_violation';
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_users_unique_active_phone
        BEFORE INSERT OR UPDATE OF phone, deleted_at
        ON users
        FOR EACH ROW
        EXECUTE FUNCTION ensure_unique_active_user_phone();

      INSERT INTO roles (name, description)
      VALUES ('admin', 'Administrator'), ('customer', 'Customer'), ('agent', 'Agent')
      ON CONFLICT (name) DO NOTHING;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS otp_codes;
      DROP TABLE IF EXISTS refresh_tokens;
      DROP TABLE IF EXISTS user_roles;
      DROP TABLE IF EXISTS roles;
      DROP TABLE IF EXISTS users;
      DROP FUNCTION IF EXISTS ensure_unique_active_user_phone;
      DROP TYPE IF EXISTS otp_purpose_enum;
      DROP TYPE IF EXISTS role_name_enum;
    `);
  }
}
