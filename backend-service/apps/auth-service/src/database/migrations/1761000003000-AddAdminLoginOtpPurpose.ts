import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminLoginOtpPurpose1761000003000 implements MigrationInterface {
  name = 'AddAdminLoginOtpPurpose1761000003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE otp_purpose_enum ADD VALUE IF NOT EXISTS 'admin_login';
    `);
  }

  async down(): Promise<void> {
    // PostgreSQL enum values cannot be safely removed without rebuilding the type.
  }
}
