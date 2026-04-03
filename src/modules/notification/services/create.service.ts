import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotificationsGateway } from 'src/gateway/notifications.gateway';
import { Notification } from '../schema/notication.schema';
import { CreateNotificationDTO } from '../dto/create.dto';

@Injectable()
export class CreateNotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
    private readonly gateway: NotificationsGateway,
  ) {}

  async execute(data: CreateNotificationDTO) {
    const notification = await this.notificationModel.create(data);

    // envia para o frontend em tempo real
    await this.gateway.notificationUser(
      notification,
      notification.userId.toString(),
    );

    return notification;
  }
}
