import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLoginLockFields1761000001000 implements MigrationInterface {
  name = 'AddLoginLockFields1761000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS locked_until,
        DROP COLUMN IF EXISTS failed_login_attempts;
    `);
  }
}
