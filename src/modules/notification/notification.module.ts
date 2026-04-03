import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Notification, NotificationSchema } from './schema/notication.schema';
import { ListNotificationsService } from './services/list.service';
import { NotificationsController } from './notification.controller';
import { CreateNotificationsService } from './services/create.service';
import { NotificationsGateway } from 'src/gateway/notifications.gateway';
import { ReadNotificationService } from './services/read.service';
import { DeleteNotificationsService } from './services/delete.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [
    CreateNotificationsService,
    ListNotificationsService,
    NotificationsGateway,
    ReadNotificationService,
    DeleteNotificationsService,
  ],
  exports: [CreateNotificationsService, ListNotificationsService],
})
export class NotificationModule {}
