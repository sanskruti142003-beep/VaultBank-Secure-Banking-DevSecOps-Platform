import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPanNumber1761000011000 implements MigrationInterface {
  name = 'AddUserPanNumber1761000011000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS pan_number VARCHAR(10);

      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_pan_number_active
        ON users(pan_number)
        WHERE pan_number IS NOT NULL AND deleted_at IS NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_users_pan_number_active;
      ALTER TABLE users DROP COLUMN IF EXISTS pan_number;
    `);
  }
}
