import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification } from '../schema/notication.schema';

@Injectable()
export class DeleteNotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
  ) {}

  /**
   * Deleta várias notificações pelo array de IDs
   */
  async execute(notificationIds: string[], userId?: string) {
    const objectIds = notificationIds.map((id) => new Types.ObjectId(id));

    const filter: any = { _id: { $in: objectIds } };

    if (userId) {
      filter.userId = userId; // garante que o usuário só delete suas próprias notificações
    }

    const result = await this.notificationModel.deleteMany(filter);

    return {
      message: `${result.deletedCount} notificações deletadas com sucesso`,
    };
  }
}
