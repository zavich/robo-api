import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ReasonLoss } from '../schema/reason-refusal.schema';
import { ListReasonLossDto } from '../dto/list-reason-loss.dto';

@Injectable()
export class ListReasonLossService {
  constructor(
    @InjectModel(ReasonLoss.name)
    private readonly reasonLossRepository: Model<ReasonLoss>,
  ) {}

  async execute(query: ListReasonLossDto) {
    const { page = 1, limit = 10, search } = query;

    try {
      const pipeline: any[] = [];

      // Filtro de busca por key ou label
      if (search && search.trim() !== '') {
        pipeline.push({
          $match: {
            $or: [
              { key: { $regex: search, $options: 'i' } },
              { label: { $regex: search, $options: 'i' } },
            ],
          },
        });
      }

      // Usar $facet para contar total e aplicar paginação
      pipeline.push({
        $facet: {
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: (page - 1) * Number(limit) },
            { $limit: Number(limit) },
          ],
          total: [{ $count: 'count' }],
        },
      });

      const [result] = await this.reasonLossRepository.aggregate(pipeline);
      const reasonLoss = result.data || [];
      const total = result.total[0]?.count || 0;

      return {
        reasonLoss,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      };
    } catch (error) {
      throw error;
    }
  }

  // Método para compatibilidade backward - retorna todos os items sem paginação
  async findAll() {
    try {
      const reasonLoss = await this.reasonLossRepository
        .find()
        .sort({ createdAt: -1 })
        .exec();
      return reasonLoss;
    } catch (error) {
      throw error;
    }
  }
}
