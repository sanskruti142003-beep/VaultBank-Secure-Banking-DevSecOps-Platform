import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PaginatedResponse,
  RemoteAuthGuard,
  Roles,
  RolesGuard,
} from '@app/common';
import { TransactionsService } from './transactions.service';
import { InitiateTransferDto } from './dto/initiate-transfer.dto';
import { InitiateDepositDto } from './dto/initiate-deposit.dto';
import { InitiateWithdrawalDto } from './dto/initiate-withdrawal.dto';
import { ReverseTransactionDto } from './dto/reverse-transaction.dto';
import { AdminTransactionFilterDto } from './dto/admin-transaction-filter.dto';
import { TransactionFilterDto } from './dto/transaction-filter.dto';
import { Transaction } from './entities';

@Controller('transactions')
@UseGuards(RemoteAuthGuard)
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post('transfer')
  transfer(
    @Body() dto: InitiateTransferDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Transaction> {
    return this.transactions.transfer(dto, actor);
  }

  @Post('deposit')
  deposit(
    @Body() dto: InitiateDepositDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Transaction> {
    return this.transactions.deposit(dto, actor);
  }

  @Post('withdrawal')
  withdrawal(
    @Body() dto: InitiateWithdrawalDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Transaction> {
    return this.transactions.withdrawal(dto, actor);
  }

  @Get()
  history(
    @Query() filter: TransactionFilterDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PaginatedResponse<Transaction>> {
    return this.transactions.history(filter, actor);
  }

  @Get('admin/all')
  @Roles('admin')
  @UseGuards(RolesGuard)
  listAll(
    @Query() filter: AdminTransactionFilterDto,
  ): Promise<PaginatedResponse<Transaction>> {
    return this.transactions.listAll(filter);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Transaction> {
    return this.transactions.get(id);
  }

  @Post(':id/reverse')
  @Roles('admin')
  @UseGuards(RolesGuard)
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseTransactionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Transaction> {
    return this.transactions.reverse(id, dto.reason, actor);
  }
}

@Controller('internal/transactions')
export class InternalTransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Transaction> {
    return this.transactions.get(id);
  }
}
