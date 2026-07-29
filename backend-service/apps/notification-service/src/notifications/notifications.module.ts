import { Module } from '@nestjs/common';
import { NotificationEventsConsumer } from './notification-events.consumer';
import { NotificationMailerService } from './notification-mailer.service';
import { NotificationService } from './notification.service';

@Module({
  providers: [
    NotificationEventsConsumer,
    NotificationMailerService,
    NotificationService,
  ],
})
export class NotificationsModule {}
