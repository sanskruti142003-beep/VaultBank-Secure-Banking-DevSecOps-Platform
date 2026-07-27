import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhoneUniquenessGuard1761000005000 implements MigrationInterface {
  name = 'AddPhoneUniquenessGuard1761000005000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_phone_active
        ON users(phone)
        WHERE phone IS NOT NULL AND deleted_at IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone_active
        ON users((regexp_replace(phone, '[^0-9+]', '', 'g')))
        WHERE phone IS NOT NULL AND deleted_at IS NULL;

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

      DROP TRIGGER IF EXISTS trg_users_unique_active_phone ON users;
      CREATE TRIGGER trg_users_unique_active_phone
        BEFORE INSERT OR UPDATE OF phone, deleted_at
        ON users
        FOR EACH ROW
        EXECUTE FUNCTION ensure_unique_active_user_phone();
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_users_unique_active_phone ON users;
      DROP FUNCTION IF EXISTS ensure_unique_active_user_phone;
      DROP INDEX IF EXISTS uq_users_phone_active;
      DROP INDEX IF EXISTS idx_users_phone_active;
    `);
  }
}
