import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  RemoteAuthGuard,
  Roles,
  RolesGuard,
} from '@app/common';
import {
  AccountLookup,
  AccountsService,
  AccountValidation,
} from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { UpdateKycDto } from './dto/update-kyc.dto';
import { UpdateLimitsDto } from './dto/update-limits.dto';
import { AddBeneficiaryDto } from './dto/add-beneficiary.dto';
import { UpdateBalanceDto } from './dto/update-balance.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { ReverseTransactionBalanceDto } from './dto/reverse-transaction-balance.dto';
import { Account, AccountLimit, Beneficiary } from './entities';

@Controller('accounts')
@UseGuards(RemoteAuthGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  open(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateAccountDto,
  ): Promise<Account> {
    return this.accounts.open(userId, dto);
  }

  @Post('approved')
  openApproved(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateAccountDto,
  ): Promise<Account> {
    return this.accounts.openApproved(userId, dto);
  }

  @Get()
  list(@CurrentUser('userId') userId: string): Promise<Account[]> {
    return this.accounts.list(userId);
  }

  @Get('admin/all')
  @Roles('admin')
  @UseGuards(RolesGuard)
  listAll(): Promise<Account[]> {
    return this.accounts.listAll();
  }

  @Post('admin/users/:userId')
  @Roles('admin')
  @UseGuards(RolesGuard)
  openApprovedForUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: CreateAccountDto,
  ): Promise<Account> {
    return this.accounts.openApproved(userId, dto);
  }

  @Get('admin/beneficiaries')
  @Roles('admin')
  @UseGuards(RolesGuard)
  beneficiariesAll(): Promise<Beneficiary[]> {
    return this.accounts.listAllBeneficiaries();
  }

  @Get('number/:accountNumber')
  getByAccountNumber(
    @Param('accountNumber') accountNumber: string,
  ): Promise<AccountLookup> {
    return this.accounts.getByAccountNumber(accountNumber);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Account> {
    return this.accounts.get(id, actor);
  }

  @Patch(':id/freeze')
  @Roles('admin')
  @UseGuards(RolesGuard)
  freeze(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ): Promise<Account> {
    return this.accounts.freeze(id, dto.reason ?? 'Administrative action');
  }

  @Patch(':id/unfreeze')
  @Roles('admin')
  @UseGuards(RolesGuard)
  unfreeze(@Param('id', ParseUUIDPipe) id: string): Promise<Account> {
    return this.accounts.unfreeze(id);
  }

  @Delete(':id')
  @Roles('admin')
  @UseGuards(RolesGuard)
  close(@Param('id', ParseUUIDPipe) id: string): Promise<Account> {
    return this.accounts.close(id);
  }

  @Post(':id/delete')
  async deleteWithOtp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteAccountDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ deleted: true }> {
    await this.accounts.deleteWithOtp(id, dto.otp, actor);
    return { deleted: true };
  }

  @Patch(':id/kyc')
  @Roles('admin')
  @UseGuards(RolesGuard)
  updateKyc(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKycDto,
  ): Promise<Account> {
    return this.accounts.updateKyc(id, dto);
  }

  @Patch(':id/limits')
  updateLimits(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLimitsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AccountLimit> {
    return this.accounts.updateLimits(id, dto, actor);
  }

  @Post(':id/beneficiaries')
  addBeneficiary(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddBeneficiaryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Beneficiary> {
    return this.accounts.addBeneficiary(id, dto, actor);
  }

  @Get(':id/beneficiaries')
  beneficiaries(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Beneficiary[]> {
    return this.accounts.beneficiaries(id, actor);
  }

  @Delete(':id/beneficiaries/:beneficiaryId')
  async removeBeneficiary(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('beneficiaryId', ParseUUIDPipe) beneficiaryId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ removed: true }> {
    await this.accounts.removeBeneficiary(id, beneficiaryId, actor);
    return { removed: true };
  }
}

@Controller('internal/accounts')
export class InternalAccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post('reverse-balance')
  reverseTransactionBalance(
    @Body() dto: ReverseTransactionBalanceDto,
  ): Promise<{ reversed: true }> {
    return this.accounts.reverseTransactionBalance(dto);
  }

  @Get(':id/validate')
  validate(@Param('id', ParseUUIDPipe) id: string): Promise<AccountValidation> {
    return this.accounts.validate(id);
  }

  @Patch(':id/balance')
  updateBalance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBalanceDto,
  ): Promise<Account> {
    return this.accounts.updateBalance(id, dto);
  }
}
