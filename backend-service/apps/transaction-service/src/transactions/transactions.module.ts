import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AUTH_TOKEN_VALIDATOR, RemoteAuthGuard } from '@app/common';
import { LedgerEntry, Transaction, TransactionFee } from './entities';
import {
  InternalTransactionsController,
  TransactionsController,
} from './transactions.controller';
import { TransactionsRepository } from './transactions.repository';
import { TransactionsService } from './transactions.service';
import { LedgerService } from './ledger.service';
import { FeeService } from './fee.service';
import { AccountHttpService } from '../http/account-http.service';
import { AuthHttpService } from '../http/auth-http.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, LedgerEntry, TransactionFee]),
    HttpModule.register({ timeout: 5000 }),
  ],
  controllers: [TransactionsController, InternalTransactionsController],
  providers: [
    TransactionsRepository,
    TransactionsService,
    LedgerService,
    FeeService,
    AccountHttpService,
    AuthHttpService,
    RemoteAuthGuard,
    { provide: AUTH_TOKEN_VALIDATOR, useExisting: AuthHttpService },
  ],
  exports: [TransactionsService],
})
export class TransactionsModule {}
