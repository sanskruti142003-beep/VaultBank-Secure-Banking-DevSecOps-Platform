import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { PaginatedResponse } from '@app/common';
import { Transaction } from './entities';
import { AdminTransactionFilterDto } from './dto/admin-transaction-filter.dto';
import { TransactionFilterDto } from './dto/transaction-filter.dto';
import { TransactionStatus } from './enums/transaction-status.enum';

@Injectable()
export class TransactionsRepository {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
  ) {}

  create(input: Partial<Transaction>): Promise<Transaction> {
    return this.transactions.save(this.transactions.create(input));
  }

  save(transaction: Transaction): Promise<Transaction> {
    return this.transactions.save(transaction);
  }

  findByReference(reference: string): Promise<Transaction | null> {
    return this.transactions.findOne({ where: { reference } });
  }

  findById(id: string): Promise<Transaction | null> {
    return this.transactions.findOne({
      where: { id },
      relations: { ledgerEntries: true, fees: true },
    });
  }

  async history(
    filter: TransactionFilterDto,
  ): Promise<PaginatedResponse<Transaction>> {
    const query = this.transactions.createQueryBuilder('transaction').where(
      new Brackets((builder) => {
        builder
          .where('transaction.from_account_id = :accountId', {
            accountId: filter.accountId,
          })
          .orWhere('transaction.to_account_id = :accountId', {
            accountId: filter.accountId,
          });
      }),
    );
    if (filter.fromDate) {
      query.andWhere('transaction.initiated_at >= :fromDate', {
        fromDate: filter.fromDate,
      });
    }
    if (filter.toDate) {
      query.andWhere('transaction.initiated_at <= :toDate', {
        toDate: filter.toDate,
      });
    }
    if (filter.status) {
      query.andWhere('transaction.status = :status', {
        status: filter.status,
      });
    }
    if (filter.type) {
      query.andWhere('transaction.type = :type', { type: filter.type });
    }
    const [data, total] = await query
      .orderBy('transaction.initiated_at', 'DESC')
      .skip((filter.page - 1) * filter.limit)
      .take(filter.limit)
      .getManyAndCount();
    return {
      data,
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  async listAll(
    filter: AdminTransactionFilterDto,
  ): Promise<PaginatedResponse<Transaction>> {
    const query = this.transactions.createQueryBuilder('transaction');
    if (filter.accountId) {
      query.where(
        new Brackets((builder) => {
          builder
            .where('transaction.from_account_id = :accountId', {
              accountId: filter.accountId,
            })
            .orWhere('transaction.to_account_id = :accountId', {
              accountId: filter.accountId,
            });
        }),
      );
    }
    if (filter.fromDate) {
      query.andWhere('transaction.initiated_at >= :fromDate', {
        fromDate: filter.fromDate,
      });
    }
    if (filter.toDate) {
      query.andWhere('transaction.initiated_at <= :toDate', {
        toDate: filter.toDate,
      });
    }
    if (filter.status) {
      query.andWhere('transaction.status = :status', {
        status: filter.status,
      });
    }
    if (filter.type) {
      query.andWhere('transaction.type = :type', { type: filter.type });
    }
    const [data, total] = await query
      .orderBy('transaction.initiated_at', 'DESC')
      .skip((filter.page - 1) * filter.limit)
      .take(filter.limit)
      .getManyAndCount();
    return {
      data,
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  async dailyOutgoing(accountId: string): Promise<string> {
    const result = await this.transactions
      .createQueryBuilder('transaction')
      .select('COALESCE(SUM(transaction.amount), 0)', 'total')
      .where('transaction.from_account_id = :accountId', { accountId })
      .andWhere('transaction.status = :status', {
        status: TransactionStatus.COMPLETED,
      })
      .andWhere('transaction.initiated_at >= :start', {
        start: new Date(new Date().setUTCHours(0, 0, 0, 0)),
      })
      .getRawOne<{ total: string }>();
    return result?.total ?? '0';
  }
}
