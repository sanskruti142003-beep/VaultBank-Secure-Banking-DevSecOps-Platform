import * as bcrypt from 'bcrypt';
import dataSource from '../data-source';
import { Role, RoleName, User, UserRole } from '../../users/entities';

const saltRounds = 12;

async function main(): Promise<void> {
  const username = required('ZAP_CUSTOMER_USERNAME').trim().toLowerCase();
  const email = required('ZAP_CUSTOMER_EMAIL').trim().toLowerCase();
  const password = required('ZAP_CUSTOMER_PASSWORD');
  const fullName =
    process.env.ZAP_CUSTOMER_FULL_NAME?.trim() || 'ZAP Staging Customer';

  await dataSource.initialize();

  try {
    await dataSource.transaction(async (manager) => {
      let role = await manager.findOne(Role, {
        where: { name: RoleName.CUSTOMER },
      });
      if (!role) {
        role = await manager.save(
          manager.create(Role, {
            name: RoleName.CUSTOMER,
            description: 'Synthetic staging customer for authenticated DAST',
          }),
        );
      }

      let user = await manager.findOne(User, {
        where: [{ username }, { email }],
        relations: { userRoles: { role: true } },
      });

      const passwordHash = await bcrypt.hash(password, saltRounds);
      if (!user) {
        user = await manager.save(
          manager.create(User, {
            username,
            email,
            passwordHash,
            phone: null,
            panNumber: null,
            fullName,
            isVerified: true,
            isActive: true,
            failedLoginAttempts: 0,
            lockedUntil: null,
          }),
        );
      } else {
        user.username = username;
        user.email = email;
        user.passwordHash = passwordHash;
        user.fullName = fullName;
        user.isVerified = true;
        user.isActive = true;
        user.failedLoginAttempts = 0;
        user.lockedUntil = null;
        await manager.save(user);
      }

      const existingCustomerRole = await manager
        .createQueryBuilder(UserRole, 'userRole')
        .innerJoin('userRole.role', 'role')
        .where('userRole.user_id = :userId', { userId: user.id })
        .andWhere('role.name = :role', { role: RoleName.CUSTOMER })
        .andWhere('userRole.deleted_at IS NULL')
        .getOne();

      if (!existingCustomerRole) {
        await manager.save(
          manager.create(UserRole, {
            user,
            role,
          }),
        );
      }
    });

    process.stdout.write('PASS: ZAP staging customer seed is current\n');
  } finally {
    await dataSource.destroy();
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown error';
  process.stderr.write(`FAIL: ZAP staging customer seed failed: ${message}\n`);
  process.exitCode = 1;
});
