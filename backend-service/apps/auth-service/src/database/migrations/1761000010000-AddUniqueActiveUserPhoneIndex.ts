import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueActiveUserPhoneIndex1761000010000
  implements MigrationInterface
{
  name = 'AddUniqueActiveUserPhoneIndex1761000010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone_active
        ON users((regexp_replace(phone, '[^0-9+]', '', 'g')))
        WHERE phone IS NOT NULL AND deleted_at IS NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_users_phone_active;
    `);
  }
}
