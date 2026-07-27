import { DataSource, QueryRunner } from 'typeorm';
import Decimal from 'decimal.js';
import { LedgerService } from './ledger.service';
import { LedgerEntry, LedgerEntryType, Transaction } from './entities';
import { TransactionType } from './enums/transaction-type.enum';

describe('LedgerService', () => {
  it('writes equal debits and credits in one QueryRunner transaction', async () => {
    let written: LedgerEntry[] = [];
    const runner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        save: jest
          .fn()
          .mockImplementation(
            (
              entity: typeof LedgerEntry,
              values: LedgerEntry[],
            ): Promise<LedgerEntry[]> => {
              if (entity === LedgerEntry) {
                written = values;
              }
              return Promise.resolve(values);
            },
          ),
        create: jest.fn().mockImplementation((_entity, value: object) => value),
      },
    } as unknown as QueryRunner;
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(runner),
    } as unknown as DataSource;
    const service = new LedgerService(dataSource);
    const transaction = {
      id: 'b92ee6e2-7219-4b34-a2de-2834cd0247c1',
      type: TransactionType.TRANSFER,
      amount: '100.0000',
      currency: 'USD',
      fromAccountId: '01450bc5-b9f4-4e55-bcc6-b9692c4dbaf4',
      toAccountId: '34fdcce4-3734-4e1f-ac1d-a34ab1f83138',
    } as Transaction;

    await service.createEntries(transaction, '0.1000', {
      fromBalance: '500.0000',
      toBalance: '20.0000',
    });

    const debits = written
      .filter((entry) => entry.entryType === LedgerEntryType.DEBIT)
      .reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0));
    const credits = written
      .filter((entry) => entry.entryType === LedgerEntryType.CREDIT)
      .reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0));
    expect(debits.equals(credits)).toBe(true);
    expect(debits.toFixed(4)).toBe('100.1000');
    expect(runner.commitTransaction).toHaveBeenCalled();
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
  });
});
