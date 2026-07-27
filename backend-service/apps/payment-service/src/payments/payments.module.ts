import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AUTH_TOKEN_VALIDATOR, RemoteAuthGuard } from '@app/common';
import { PaymentOrder, PaymentReceipt, Refund } from './entities';
import { PaymentsController } from './payments.controller';
import { WebhookController } from './webhook.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import { PaymentOtpEmailService } from './payment-otp-email.service';
import { ReceiptService } from './receipt.service';
import { RefundService } from './refund.service';
import { TransferOtpService } from './transfer-otp.service';
import { AuthHttpService } from '../http/auth-http.service';
import { TransactionHttpService } from '../http/transaction-http.service';
import { TransactionEventsConsumer } from '../consumers/transaction-events.consumer';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentOrder, PaymentReceipt, Refund]),
    HttpModule.register({ timeout: 5000 }),
  ],
  controllers: [PaymentsController, WebhookController],
  providers: [
    PaymentsRepository,
    PaymentsService,
    PaymentOtpEmailService,
    ReceiptService,
    RefundService,
    TransferOtpService,
    AuthHttpService,
    TransactionHttpService,
    TransactionEventsConsumer,
    RemoteAuthGuard,
    { provide: AUTH_TOKEN_VALIDATOR, useExisting: AuthHttpService },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
