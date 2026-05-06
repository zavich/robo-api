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
      classProcess,
      emptyDocuments,
      hasSecondInstance,
      hasAutos,
      hasAcordao,
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
    const andConditions: any[] = [];
    // 🔹 Busca
    if (search?.trim()) {
      andConditions.push({
        $or: [
          { number: { $regex: this.escapeRegex(search), $options: 'i' } },
          {
            'processParts.nome': {
              $regex: this.escapeRegex(search),
              $options: 'i',
            },
          },
        ],
      });
    }
    if (classProcess) {
      match.class = classProcess;
    }
    if (hasSecondInstance) {
      match.instancias = { $size: 2 };
    }
    if (hasAutos) {
      match.instanciasAutos = { $exists: true, $not: { $size: 0 } };
    }
    if (hasAcordao) {
      match['documents.title'] = { $regex: /acordao/i };
    }
    // 🔹 Filtro por activities
    if (status || lossReason) {
      match.activities = {
        $elemMatch: {
          ...(status && { status }),
          ...(lossReason && { lossReason }),
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
      andConditions.push({
        $or: [{ activities: { $exists: false } }, { activities: { $size: 0 } }],
      });
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
      andConditions.push({
        $or: [{ documents: { $exists: false } }, { documents: { $size: 0 } }],
      });
    }
    if (andConditions.length) {
      match.$and = andConditions;
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
  escapeRegex(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
