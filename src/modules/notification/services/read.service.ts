import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification } from '../schema/notication.schema';
import { NotificationsGateway } from 'src/gateway/notifications.gateway';

@Injectable()
export class ReadNotificationService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * Marca uma notificação como lida
   */
  async execute(notificationId: string, userId: string) {
    const notification = await this.notificationModel.findOneAndUpdate(
      { _id: new Types.ObjectId(notificationId), userId: userId },
      { read: true, updatedAt: new Date() },
      { new: true },
    );

    if (!notification) {
      throw new NotFoundException(
        'Notificação não encontrada ou não pertence ao usuário',
      );
    }

    return notification;
  }
}
