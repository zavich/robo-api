import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Process as ProcessEntity } from '../../schema/process.schema';
import { User } from 'src/modules/user/schema/user.schema';
import { ListProcessFiltersDto } from '../../dtos/list-process-filters.dto';

@Injectable()
export class ListLawsuitService {
  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly lawsuitModule: Model<ProcessEntity>,
    @InjectModel(User.name)
    private readonly userModule: Model<User>,
  ) {}

  async execute(query: ListProcessFiltersDto, userId?: string) {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      startDate,
      endDate,
      lossReason,
      type,
      emptyDocuments,
    } = query;

    const skip = (page - 1) * Number(limit);
    const limitNum = Number(limit);

    const user = await this.userModule.findById(userId);
    const isAdvogado = user?.role === 'advogado';
    const isAdmin = user?.role === 'admin';

    const match: any = {};

    // 🔹 Filtro de data
    if (!isAdvogado) {
      const dateFilter: any = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
      if (Object.keys(dateFilter).length) {
        match.createdAt = dateFilter;
      }
    }

    // 🔹 Busca
    if (search?.trim()) {
      match.$or = [
        { number: { $regex: search, $options: 'i' } },
        { 'processParts.nome': { $regex: search, $options: 'i' } },
      ];
    }

    // 🔹 Filtro por activities
    if (status || lossReason || type) {
      match.activities = {
        $elemMatch: {
          ...(status && { status }),
          ...(lossReason && { lossReason }),
          ...(type && { type }),
        },
      };
    }

    // 🔹 Filtros de advogado
    if (isAdvogado) {
      match['activities.assignedTo'] = userId;

      if (startDate || endDate) {
        const activityDateFilter: any = {};
        if (startDate) activityDateFilter.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          activityDateFilter.$lte = end;
        }

        match.activities = {
          $elemMatch: {
            assignedTo: userId,
            createdAt: activityDateFilter,
          },
        };
      }
    }

    // 🔹 Admin
    if (isAdmin) {
      match.$or = [
        { activities: { $exists: false } },
        { activities: { $size: 0 } },
      ];
    }

    // 🔹 Pipeline otimizado
    const pipeline: any[] = [
      { $match: match },

      // 🔥 usa índice (ESSENCIAL)
      { $sort: { createdAt: -1 } },

      { $skip: skip },

      // buffer maior pra manter qualidade da ordenação
      { $limit: limitNum * 10 },

      // 🔥 calcula flags
      {
        $addFields: {
          hasDocuments: {
            $gt: [{ $size: { $ifNull: ['$documents', []] } }, 0],
          },
          hasInstancias: {
            $gt: [{ $size: { $ifNull: ['$instancias', []] } }, 0],
          },
        },
      },

      // 🔥 ordenação FINAL (prioridade correta)
      {
        $sort: {
          hasDocuments: -1, // 1º prioridade
          hasInstancias: -1, // 2º prioridade
          createdAt: -1, // 3º
        },
      },

      { $limit: limitNum },

      {
        $lookup: {
          from: 'processstatuses',
          localField: 'processStatus',
          foreignField: '_id',
          as: 'processStatus',
        },
      },
      {
        $addFields: {
          processStatus: { $arrayElemAt: ['$processStatus', 0] },
        },
      },

      {
        $project: {
          instanciasAutosWithDocs: 0,
          moviments: 0,
          documents: 0,
          formPipedrive: 0,
        },
      },
    ];

    if (emptyDocuments) {
      match.$and = match.$and || [];

      match.$and.push({
        $or: [{ documents: { $exists: false } }, { documents: { $size: 0 } }],
      });
    }

    const [processes, total] = await Promise.all([
      this.lawsuitModule.aggregate(pipeline).allowDiskUse(true),
      this.lawsuitModule.countDocuments(match),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    return {
      processes,
      total,
      page: Number(page),
      limit: limitNum,
      totalPages,
    };
  }
}
