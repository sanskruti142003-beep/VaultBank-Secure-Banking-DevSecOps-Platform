import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountDeleteOtpPurpose1761000002000 implements MigrationInterface {
  name = 'AddAccountDeleteOtpPurpose1761000002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE otp_purpose_enum ADD VALUE IF NOT EXISTS 'account_delete';
    `);
  }

  async down(): Promise<void> {
    // PostgreSQL enum values cannot be safely removed without rebuilding the type.
  }
}
