import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsernameToUsers1761000004000 implements MigrationInterface {
  name = 'AddUsernameToUsers1761000004000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS username CITEXT;

      WITH prepared AS (
        SELECT
          id,
          lower(
            COALESCE(
              NULLIF(regexp_replace(split_part(email::text, '@', 1), '[^a-zA-Z0-9._-]', '', 'g'), ''),
              'user'
            )
          ) AS base_username
        FROM users
        WHERE username IS NULL
      ),
      numbered AS (
        SELECT
          id,
          base_username,
          row_number() OVER (PARTITION BY base_username ORDER BY id) AS duplicate_index
        FROM prepared
      )
      UPDATE users AS target
      SET username =
        numbered.base_username ||
        CASE
          WHEN numbered.duplicate_index = 1 THEN ''
          ELSE numbered.duplicate_index::text
        END
      FROM numbered
      WHERE target.id = numbered.id;

      ALTER TABLE users
        ALTER COLUMN username SET NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_users_username;
      DROP INDEX IF EXISTS uq_users_username;
      ALTER TABLE users
        DROP COLUMN IF EXISTS username;
    `);
  }
}
