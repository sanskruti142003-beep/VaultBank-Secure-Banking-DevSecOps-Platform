import { EventBusService } from '@app/events';
import { AccountsService } from './accounts.service';
import { AccountsRepository } from './accounts.repository';
import { Account, AccountCurrency, AccountLimit } from './entities';
import { AccountType } from './enums/account-type.enum';
import { AccountStatus } from './enums/account-status.enum';
import { KycStatus } from './enums/kyc-status.enum';
import { BalanceOperation } from './dto/update-balance.dto';
import { AuthHttpService } from '../http/auth-http.service';

describe('AccountsService', () => {
  let service: AccountsService;
  let repository: jest.Mocked<AccountsRepository>;
  let events: jest.Mocked<EventBusService>;
  let auth: jest.Mocked<AuthHttpService>;
  let account: Account;

  beforeEach(() => {
    account = {
      id: 'f45d058a-cda2-4f79-a489-993bc494f7ef',
      userId: '13b70088-5d2b-4e73-9af4-7f1c72181f54',
      accountNumber: '1012345678',
      type: AccountType.SAVINGS,
      currency: AccountCurrency.USD,
      balance: '2500.0000',
      status: AccountStatus.ACTIVE,
      kycStatus: KycStatus.APPROVED,
      limits: {
        dailyTransferLimit: '10000.0000',
        singleTxnLimit: '5000.0000',
      } as AccountLimit,
      beneficiaries: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as Account;
    repository = {
      createAccount: jest.fn().mockResolvedValue(account),
      applyBalanceAdjustment: jest.fn().mockResolvedValue(undefined),
      saveAccount: jest
        .fn()
        .mockImplementation((value: Account) => Promise.resolve(value)),
      findById: jest.fn().mockResolvedValue(account),
      findByNumber: jest.fn().mockResolvedValue(null),
      saveLimits: jest.fn().mockResolvedValue(account.limits),
      deleteAccount: jest.fn(),
    } as unknown as jest.Mocked<AccountsRepository>;
    events = {
      publish: jest.fn(),
    } as unknown as jest.Mocked<EventBusService>;
    auth = {
      verifyAccountDeletionOtp: jest.fn(),
    } as unknown as jest.Mocked<AuthHttpService>;
    service = new AccountsService(repository, events, auth);
  });

  it('opens an account with default limits and publishes account.created', async () => {
    const result = await service.open(account.userId, {
      type: AccountType.SAVINGS,
      currency: AccountCurrency.USD,
    });

    expect(result.id).toBe(account.id);
    expect(repository.saveLimits).toHaveBeenCalledWith(
      account.id,
      '10000.0000',
      '5000.0000',
    );
    expect(events.publish).toHaveBeenCalledWith(
      'account.created',
      expect.objectContaining({ accountId: account.id }),
    );
  });

  it('freezes an account and emits a reason', async () => {
    const result = await service.freeze(account.id, 'Compliance review');
    expect(result.status).toBe(AccountStatus.FROZEN);
    expect(events.publish).toHaveBeenCalledWith('account.frozen', {
      accountId: account.id,
      userId: account.userId,
      reason: 'Compliance review',
    });
  });

  it('returns the internal transaction validation contract', async () => {
    await expect(service.validate(account.id)).resolves.toEqual({
      isActive: true,
      balance: '2500.0000',
      currency: 'USD',
      kycStatus: KycStatus.APPROVED,
      dailyLimit: '10000.0000',
      singleTxnLimit: '5000.0000',
      userId: account.userId,
    });
  });

  it('credits an account balance', async () => {
    const result = await service.updateBalance(account.id, {
      operation: BalanceOperation.CREDIT,
      amount: '150.0000',
    });

    expect(result.balance).toBe('2650.0000');
    expect(repository.saveAccount).toHaveBeenCalledWith(
      expect.objectContaining({ balance: '2650.0000' }),
    );
  });

  it('applies a transaction balance reversal', async () => {
    await expect(
      service.reverseTransactionBalance({
        creditAccountId: '1bde435f-d64c-4ad0-be07-2712eb040c0e',
        creditAmount: '100.1000',
        debitAccountId: '7f54d944-709f-49eb-b7d4-8b473cefe900',
        debitAmount: '100.0000',
      }),
    ).resolves.toEqual({ reversed: true });

    expect(repository.applyBalanceAdjustment).toHaveBeenCalledWith({
      creditAccountId: '1bde435f-d64c-4ad0-be07-2712eb040c0e',
      creditAmount: '100.1000',
      debitAccountId: '7f54d944-709f-49eb-b7d4-8b473cefe900',
      debitAmount: '100.0000',
    });
  });

  it('rejects incomplete transaction balance reversal details', async () => {
    await expect(
      service.reverseTransactionBalance({
        debitAccountId: account.id,
      }),
    ).rejects.toThrow('debit account and amount must both be provided');
    expect(repository.applyBalanceAdjustment).not.toHaveBeenCalled();
  });

  it('rejects debits larger than the balance', async () => {
    await expect(
      service.updateBalance(account.id, {
        operation: BalanceOperation.DEBIT,
        amount: '3000.0000',
      }),
    ).rejects.toThrow('Insufficient account balance');
  });

  it('verifies OTP before deleting an owned account', async () => {
    await service.deleteWithOtp(account.id, '123456', {
      userId: account.userId,
      email: 'user@example.com',
      roles: ['customer'],
    });

    expect(auth.verifyAccountDeletionOtp).toHaveBeenCalledWith(
      account.userId,
      '123456',
    );
    expect(repository.deleteAccount).toHaveBeenCalledWith(account.id);
    expect(events.publish).toHaveBeenCalledWith('account.closed', {
      accountId: account.id,
      userId: account.userId,
    });
  });
});
