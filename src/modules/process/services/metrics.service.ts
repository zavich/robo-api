import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ProcessMetricsResponseDto,
  ActivityTypeMetrics,
} from '../dtos/metrics.dto';
import { ActivityStatus, TypeActivity } from '../interfaces/enum';
import { Process, ProcessDocument } from '../schema/process.schema';

export interface MetricsFilters {
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class MetricsService {
  constructor(
    @InjectModel(Process.name)
    private readonly processModel: Model<ProcessDocument>,
  ) {}

  async execute(
    filters: MetricsFilters = {},
  ): Promise<ProcessMetricsResponseDto> {
    const matchStage: any = {};

    // Filtro por data
    if (filters.startDate || filters.endDate) {
      matchStage.createdAt = {};
      if (filters.startDate) {
        // Converter para Date e definir início do dia
        const startDate = new Date(filters.startDate);
        startDate.setUTCHours(0, 0, 0, 0);
        matchStage.createdAt.$gte = startDate;
      }
      if (filters.endDate) {
        // Converter para Date e definir final do dia
        const endDate = new Date(filters.endDate);
        endDate.setUTCHours(23, 59, 59, 999);
        matchStage.createdAt.$lte = endDate;
      }
    }

    // Debug: Log dos filtros aplicados (remover em produção)

    const pipeline = [
      { $match: matchStage },
      {
        $facet: {
          // Quantidade total de processos únicos que têm atividades
          totalProcesses: [
            { $unwind: '$activities' },
            {
              $group: {
                _id: '$_id', // Agrupar por ID do processo para contar processos únicos
              },
            },
            { $count: 'count' },
          ],

          // Métricas por tipo de atividade - contagem direta de processos únicos
          activitiesByTypeAndStatus: [
            { $unwind: '$activities' },
            {
              $group: {
                _id: {
                  processId: '$_id',
                  activityType: '$activities.type',
                  isCompleted: '$activities.isCompleted',
                  status: '$activities.status',
                },
              },
            },
            {
              $group: {
                _id: {
                  activityType: '$_id.activityType',
                  isCompleted: '$_id.isCompleted',
                  status: '$_id.status',
                },
                count: { $sum: 1 },
              },
            },
          ],

          // Contagem simples de processos por tipo de atividade (para comparação)
          simpleCountByType: [
            { $unwind: '$activities' },
            {
              $group: {
                _id: {
                  processId: '$_id',
                  activityType: '$activities.type',
                },
              },
            },
            {
              $group: {
                _id: '$_id.activityType',
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ];

    const [result] = await this.processModel.aggregate(pipeline).exec();

    // Processar os resultados
    const totalProcesses = result.totalProcesses[0]?.count || 0;

    const processesByActivityType: {
      [key in TypeActivity]: ActivityTypeMetrics;
    } = {
      [TypeActivity.PRE_ANALISE]: {
        total: 0,
        pending: 0,
        completed: 0,
        approved: 0,
        rejected: 0,
      },
      [TypeActivity.ANALISE]: {
        total: 0,
        pending: 0,
        completed: 0,
        approved: 0,
        rejected: 0,
      },
      [TypeActivity.CALCULO]: {
        total: 0,
        pending: 0,
        completed: 0,
        approved: 0,
        rejected: 0,
      },
    };

    // Processar métricas por tipo de atividade
    result.activitiesByTypeAndStatus.forEach((item: any) => {
      const activityType = item._id.activityType;
      const isCompleted = item._id.isCompleted;
      const status = item._id.status;
      const count = item.count;

      if (processesByActivityType[activityType]) {
        processesByActivityType[activityType].total += count;

        if (!isCompleted) {
          processesByActivityType[activityType].pending += count;
        } else {
          processesByActivityType[activityType].completed += count;

          if (status === ActivityStatus.APROVED) {
            processesByActivityType[activityType].approved += count;
          } else if (status === ActivityStatus.LOSS) {
            processesByActivityType[activityType].rejected += count;
          }
        }
      }
    });

    return {
      totalProcesses,
      processesByActivityType,
    };
  }
}
