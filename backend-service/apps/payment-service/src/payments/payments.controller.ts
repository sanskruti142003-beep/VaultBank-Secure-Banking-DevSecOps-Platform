import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PaginatedResponse,
  PaginationDto,
  RemoteAuthGuard,
  Roles,
  RolesGuard,
} from '@app/common';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { RefundRequestDto } from './dto/refund-request.dto';
import { SendPaymentOtpDto } from './dto/send-payment-otp.dto';
import { PaymentOrder, Refund } from './entities';
import { PaymentsService } from './payments.service';
import { RefundService } from './refund.service';
import { TransferOtpService } from './transfer-otp.service';

@Controller('payments')
@UseGuards(RemoteAuthGuard)
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly refunds: RefundService,
    private readonly transferOtp: TransferOtpService,
  ) {}

  @Post('otp/send')
  sendTransferOtp(
    @Body() dto: SendPaymentOtpDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{
    email?: string;
    message: string;
    phone?: string;
    expiresInSeconds: number;
    deliveryStatus: 'sent' | 'blocked';
    deliveryChannel: 'sms' | 'email';
  }> {
    return this.transferOtp.send(actor, dto.email);
  }

  @Post()
  initiate(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('authorization') bearerToken: string,
  ): Promise<PaymentOrder> {
    return this.payments.initiate(dto, actor, bearerToken);
  }

  @Get()
  list(
    @CurrentUser('userId') userId: string,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResponse<PaymentOrder>> {
    return this.payments.list(userId, pagination);
  }

  @Get('admin/all')
  @Roles('admin')
  @UseGuards(RolesGuard)
  listAll(
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResponse<PaymentOrder>> {
    return this.payments.listAll(pagination);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PaymentOrder> {
    return this.payments.get(id, actor);
  }

  @Post(':id/refund')
  async requestRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Refund> {
    return this.refunds.request(
      await this.payments.get(id, actor),
      dto.reason,
      actor,
    );
  }

  @Get(':id/refund')
  async refundStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Refund> {
    await this.payments.get(id, actor);
    return this.refunds.status(id);
  }

  @Patch(':id/refund/:refundId/approve')
  @Roles('admin')
  @UseGuards(RolesGuard)
  async approveRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('refundId', ParseUUIDPipe) refundId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Refund> {
    const order = await this.payments.get(id, actor);
    return this.refunds.approve(refundId, order);
  }
}
