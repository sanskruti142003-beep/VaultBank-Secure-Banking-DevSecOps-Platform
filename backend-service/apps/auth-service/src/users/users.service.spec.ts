import { ConflictException, NotFoundException } from '@nestjs/common';
import { RoleName, User } from './entities';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let repository: jest.Mocked<UsersRepository>;
  let user: User;

  beforeEach(() => {
    user = {
      id: 'd72aa25c-fb9f-4078-9345-e9a9fbd755d5',
      username: 'bank.user',
      email: 'user@example.com',
      passwordHash: '',
      phone: null,
      panNumber: null,
      fullName: 'Bank User',
      isVerified: true,
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      userRoles: [
        {
          role: { name: RoleName.CUSTOMER },
        },
      ],
      refreshTokens: [],
      otpCodes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as unknown as User;

    repository = {
      findById: jest.fn().mockResolvedValue(user),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByPanNumber: jest.fn(),
      findAll: jest.fn(),
      saveUser: jest
        .fn()
        .mockImplementation((value: User) => Promise.resolve(value)),
    } as unknown as jest.Mocked<UsersRepository>;

    service = new UsersService(repository);
  });

  it('saves a unique PAN number on the profile', async () => {
    repository.findByPanNumber.mockResolvedValue(null);

    const result = await service.updateProfile(user.id, {
      pan_number: 'ABCDE1234F',
    } satisfies UpdateProfileDto);

    expect(repository.findByPanNumber).toHaveBeenCalledWith('ABCDE1234F');
    expect(repository.saveUser).toHaveBeenCalledWith(
      expect.objectContaining({ panNumber: 'ABCDE1234F' }),
    );
    expect(result.panNumber).toBe('ABCDE1234F');
  });

  it('rejects a PAN number used by another user', async () => {
    repository.findByPanNumber.mockResolvedValue({
      ...user,
      id: 'e4eca738-c57d-45ad-817e-1c20cdf261d4',
    } as User);

    await expect(
      service.updateProfile(user.id, {
        pan_number: 'ABCDE1234F',
      } satisfies UpdateProfileDto),
    ).rejects.toThrow(ConflictException);

    expect(repository.saveUser).not.toHaveBeenCalled();
  });

  it('allows the same user to keep their existing PAN number', async () => {
    user.panNumber = 'ABCDE1234F';
    repository.findByPanNumber.mockResolvedValue(user);

    await expect(
      service.updateProfile(user.id, {
        pan_number: 'ABCDE1234F',
      } satisfies UpdateProfileDto),
    ).resolves.toEqual(expect.objectContaining({ panNumber: 'ABCDE1234F' }));
  });

  it('maps database PAN uniqueness errors to a conflict response', async () => {
    repository.findByPanNumber.mockResolvedValue(null);
    repository.saveUser.mockRejectedValue({
      code: '23505',
      constraint: 'uq_users_pan_number_active',
      detail: 'Key (pan_number)=(ABCDE1234F) already exists.',
      message:
        'duplicate key value violates unique constraint "uq_users_pan_number_active"',
    });

    await expect(
      service.updateProfile(user.id, {
        pan_number: 'ABCDE1234F',
      } satisfies UpdateProfileDto),
    ).rejects.toThrow('PAN number is already registered');
  });

  it('includes the PAN number in profile responses', () => {
    user.panNumber = 'ABCDE1234F';

    expect(service.profile(user)).toEqual(
      expect.objectContaining({
        pan_number: 'ABCDE1234F',
      }),
    );
  });

  it('throws when the user does not exist', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.getById(user.id)).rejects.toThrow(NotFoundException);
  });
});
