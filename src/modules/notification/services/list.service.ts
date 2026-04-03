import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { Notification } from '../schema/notication.schema';

@Injectable()
export class ListNotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
  ) {}

  async execute(userId: string, options?: { page?: number; limit?: number }) {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const skip = (page - 1) * limit;
    console.log('userId', userId);

    const aggregation = await this.notificationModel.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } }, // filtra pelo usuário
      { $sort: { createdAt: -1 } }, // ordena por data
      {
        $facet: {
          items: [{ $skip: skip }, { $limit: limit }], // paginação
          totalCount: [{ $count: 'count' }], // conta total
        },
      },
    ]);

    const items = aggregation[0]?.items || [];
    const total = aggregation[0]?.totalCount[0]?.count || 0;

    return {
      notifications: items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}
