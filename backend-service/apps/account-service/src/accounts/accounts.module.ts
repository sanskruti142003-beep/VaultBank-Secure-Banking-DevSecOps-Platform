import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AUTH_TOKEN_VALIDATOR, RemoteAuthGuard } from '@app/common';
import { Account, AccountLimit, Beneficiary } from './entities';
import {
  AccountsController,
  InternalAccountsController,
} from './accounts.controller';
import { AccountsRepository } from './accounts.repository';
import { AccountsService } from './accounts.service';
import { AuthHttpService } from '../http/auth-http.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Account, AccountLimit, Beneficiary]),
    HttpModule.register({ timeout: 5000 }),
  ],
  controllers: [AccountsController, InternalAccountsController],
  providers: [
    AccountsRepository,
    AccountsService,
    AuthHttpService,
    RemoteAuthGuard,
    {
      provide: AUTH_TOKEN_VALIDATOR,
      useExisting: AuthHttpService,
    },
  ],
  exports: [AccountsService],
})
export class AccountsModule {}
