import { AuthenticatedUser } from '@app/common';
import { EventBusService } from '@app/events';
import { BadRequestException } from '@nestjs/common';
import {
  AccountHttpService,
  AccountValidation,
} from '../http/account-http.service';
import { FeeService } from './fee.service';
import { LedgerService } from './ledger.service';
import { TransactionsRepository } from './transactions.repository';
import { TransactionsService } from './transactions.service';
import { Transaction } from './entities';
import { TransactionStatus } from './enums/transaction-status.enum';
import { TransactionType } from './enums/transaction-type.enum';

describe('TransactionsService transfer', () => {
  let service: TransactionsService;
  let repository: jest.Mocked<TransactionsRepository>;
  let accounts: jest.Mocked<AccountHttpService>;
  let fees: jest.Mocked<FeeService>;
  let ledger: jest.Mocked<LedgerService>;
  let events: jest.Mocked<EventBusService>;
  let from: AccountValidation;
  let to: AccountValidation;
  const actor: AuthenticatedUser = {
    userId: '206db673-fb75-40e9-a0d6-653ca9e03f12',
    email: 'owner@example.com',
    roles: ['customer'],
  };

  beforeEach(() => {
    from = {
      isActive: true,
      balance: '1000.0000',
      currency: 'USD',
      kycStatus: 'approved',
      dailyLimit: '5000.0000',
      singleTxnLimit: '2000.0000',
      userId: actor.userId,
    };
    to = { ...from, userId: 'other-user', balance: '50.0000' };
    repository = {
      findByReference: jest.fn().mockResolvedValue(null),
      findById: jest.fn(),
      dailyOutgoing: jest.fn().mockResolvedValue('0.0000'),
      create: jest.fn().mockImplementation((input: Partial<Transaction>) =>
        Promise.resolve({
          id: 'fcb21bcf-0f25-4513-b165-fd21fb09e1bb',
          ...input,
        } as Transaction),
      ),
      save: jest
        .fn()
        .mockImplementation((value: Transaction) => Promise.resolve(value)),
    } as unknown as jest.Mocked<TransactionsRepository>;
    accounts = {
      validateAccount: jest
        .fn()
        .mockResolvedValueOnce(from)
        .mockResolvedValueOnce(to),
      updateBalance: jest.fn().mockResolvedValue(undefined),
      reverseTransactionBalance: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AccountHttpService>;
    fees = {
      calculate: jest.fn().mockReturnValue('0.1000'),
    } as unknown as jest.Mocked<FeeService>;
    ledger = {
      createEntries: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<LedgerService>;
    events = {
      publish: jest.fn(),
    } as unknown as jest.Mocked<EventBusService>;
    service = new TransactionsService(
      repository,
      accounts,
      fees,
      ledger,
      events,
    );
  });

  it('completes the strict transfer sequence', async () => {
    const result = await service.transfer(
      {
        fromAccountId: '1bde435f-d64c-4ad0-be07-2712eb040c0e',
        toAccountId: '7f54d944-709f-49eb-b7d4-8b473cefe900',
        amount: '100.0000',
        currency: 'USD',
      },
      actor,
    );

    expect(result.status).toBe(TransactionStatus.COMPLETED);
    expect(ledger.createEntries).toHaveBeenCalled();
    expect(accounts.updateBalance).toHaveBeenCalledTimes(2);
    expect(events.publish).toHaveBeenCalledWith(
      'transaction.initiated',
      expect.objectContaining({ amount: '100.0000' }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      'transaction.completed',
      expect.objectContaining({ txnId: result.id }),
    );
  });

  it.each([
    ['inactive source', { isActive: false }, 'Account is not active'],
    ['unapproved KYC', { kycStatus: 'pending' }, 'Approved KYC is required'],
    [
      'insufficient balance',
      { balance: '10.0000' },
      'Insufficient account balance',
    ],
    [
      'single limit exceeded',
      { singleTxnLimit: '50.0000' },
      'Single transaction limit exceeded',
    ],
    ['currency mismatch', { currency: 'EUR' }, 'Account currency mismatch'],
  ])(
    'rejects %s before writing a transaction',
    async (_name, change, expected) => {
      accounts.validateAccount
        .mockReset()
        .mockResolvedValueOnce({ ...from, ...change } as AccountValidation)
        .mockResolvedValueOnce(to);

      await expect(
        service.transfer(
          {
            fromAccountId: '1bde435f-d64c-4ad0-be07-2712eb040c0e',
            toAccountId: '7f54d944-709f-49eb-b7d4-8b473cefe900',
            amount: '100.0000',
            currency: 'USD',
          },
          actor,
        ),
      ).rejects.toThrow(expected);
      expect(repository.create).not.toHaveBeenCalled();
    },
  );

  it('uses transfer fee rules', () => {
    const feeService = new FeeService();
    expect(feeService.calculate(TransactionType.TRANSFER, '1000.0000')).toBe(
      '1.0000',
    );
    expect(feeService.calculate(TransactionType.WITHDRAWAL, '10')).toBe(
      '1.5000',
    );
    expect(feeService.calculate(TransactionType.DEPOSIT, '10')).toBe('0.0000');
  });

  it('throws a banking validation exception for non-positive amounts', async () => {
    await expect(
      service.transfer(
        {
          fromAccountId: '1bde435f-d64c-4ad0-be07-2712eb040c0e',
          toAccountId: '7f54d944-709f-49eb-b7d4-8b473cefe900',
          amount: '0',
          currency: 'USD',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('moves transfer balances back before marking a transaction reversed', async () => {
    const transaction = {
      id: 'fcb21bcf-0f25-4513-b165-fd21fb09e1bb',
      reference: 'TXN20260727ABC123',
      fromAccountId: '1bde435f-d64c-4ad0-be07-2712eb040c0e',
      toAccountId: '7f54d944-709f-49eb-b7d4-8b473cefe900',
      amount: '100.0000',
      currency: 'USD',
      type: TransactionType.TRANSFER,
      status: TransactionStatus.COMPLETED,
      metadata: null,
      fees: [{ amount: '0.1000' }],
    } as unknown as Transaction;
    repository.findById.mockResolvedValueOnce(transaction);

    const result = await service.reverse(transaction.id, 'Customer dispute', {
      ...actor,
      roles: ['admin'],
    });

    expect(accounts.reverseTransactionBalance).toHaveBeenCalledWith({
      creditAccountId: transaction.fromAccountId,
      creditAmount: '100.1000',
      debitAccountId: transaction.toAccountId,
      debitAmount: '100.0000',
    });
    expect(result.status).toBe(TransactionStatus.REVERSED);
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: TransactionStatus.REVERSED,
        metadata: expect.objectContaining({
          reversalReason: 'Customer dispute',
        }),
      }),
    );
  });

  it('does not mark reversed when the balance reversal fails', async () => {
    const transaction = {
      id: 'fcb21bcf-0f25-4513-b165-fd21fb09e1bb',
      reference: 'TXN20260727ABC123',
      fromAccountId: '1bde435f-d64c-4ad0-be07-2712eb040c0e',
      toAccountId: '7f54d944-709f-49eb-b7d4-8b473cefe900',
      amount: '100.0000',
      currency: 'USD',
      type: TransactionType.TRANSFER,
      status: TransactionStatus.COMPLETED,
      metadata: null,
      fees: [],
    } as unknown as Transaction;
    repository.findById.mockResolvedValueOnce(transaction);
    accounts.reverseTransactionBalance.mockRejectedValueOnce(
      new BadRequestException(
        'Insufficient account balance to reverse transaction',
      ),
    );

    await expect(
      service.reverse(transaction.id, 'Customer dispute', {
        ...actor,
        roles: ['admin'],
      }),
    ).rejects.toThrow('Insufficient account balance to reverse transaction');
    expect(transaction.status).toBe(TransactionStatus.COMPLETED);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
