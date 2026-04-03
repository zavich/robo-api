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
      emptyDocuments,
      emptyInstances,
      hasNewMovements: hasNewMovementsRaw,
      type,
    } = query;

    // Converter hasNewMovements para boolean
    let hasNewMovements: boolean | undefined = undefined;
    if (hasNewMovementsRaw !== undefined) {
      if (typeof hasNewMovementsRaw === 'string') {
        hasNewMovements = hasNewMovementsRaw === 'true';
      } else {
        hasNewMovements = Boolean(hasNewMovementsRaw);
      }
    }

    // Verificar o role do usuário primeiro para determinar o tipo de filtro de data
    const userToFilter = userId;
    const findUser = await this.userModule.findById(userToFilter);
    const isAdvogado = findUser?.role === 'advogado';
    const isAdmin = findUser?.role === 'admin';

    const initialMatch: any = {};
    const searchMatch: any = {};

    // Aplicar filtro de data baseado no role do usuário
    if (!isAdvogado) {
      // Para usuários que não são advogados, usar createdAt do processo
      const dateFilter: any = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        dateFilter.$lte = endDateTime;
      }
      if (Object.keys(dateFilter).length > 0)
        initialMatch.createdAt = dateFilter;
    }

    if (search && search.trim() !== '') {
      searchMatch.$or = [
        { number: { $regex: search, $options: 'i' } },
        { 'processParts.nome': { $regex: search, $options: 'i' } },
      ];
    }

    // Filtro por status e/ou lossReason dentro das activities (array)
    const activityMatch: any = {};

    if (status && status.trim() !== '') {
      activityMatch.status = status;
    }

    if (lossReason && (lossReason as string).trim() !== '') {
      activityMatch.lossReason = lossReason;
    }

    if (type && type.trim() !== '') {
      activityMatch.type = type;
    }

    // Só aplicar o filtro de activities se houver pelo menos um critério
    if (Object.keys(activityMatch).length > 0) {
      searchMatch.activities = { $elemMatch: activityMatch };
    }

    const emptyFilters: any = {};
    if (emptyDocuments !== undefined)
      emptyFilters.isDocuments = !emptyDocuments;
    if (emptyInstances !== undefined)
      emptyFilters.isInstancias = !emptyInstances;

    const skip = (page - 1) * Number(limit);
    const limitNum = Number(limit);

    // Pipeline principal sem o sort problemático no início
    const basePipeline: any[] = [
      { $match: { ...initialMatch, ...searchMatch } },
      {
        $addFields: {
          isInstancias: {
            $gt: [{ $size: { $ifNull: ['$instancias', []] } }, 0],
          },
          isDocuments: { $gt: [{ $size: { $ifNull: ['$documents', []] } }, 0] },
        },
      },
      ...(Object.keys(emptyFilters).length ? [{ $match: emptyFilters }] : []),
      {
        $lookup: {
          from: 'processstatuses',
          localField: 'processStatus',
          foreignField: '_id',
          as: 'processStatus',
        },
      },
      {
        $addFields: { processStatus: { $arrayElemAt: ['$processStatus', 0] } },
      },
    ];

    // Aplicar filtro por hasNewMovements **depois** de calcular o campo
    if (hasNewMovements !== undefined) {
      basePipeline.push({ $match: { hasNewMovementsNow: hasNewMovements } });
    }

    // Aplicar filtro por assignedTo nas atividades e filtro de data para advogados
    if (isAdvogado) {
      basePipeline.push({
        $match: {
          'activities.assignedTo': userToFilter,
        },
      });

      // Para advogados, aplicar filtro de data nas atividades
      if (startDate || endDate) {
        const activityDateFilter: any = {};
        if (startDate) activityDateFilter.$gte = new Date(startDate);
        if (endDate) {
          const endDateTime = new Date(endDate);
          endDateTime.setHours(23, 59, 59, 999);
          activityDateFilter.$lte = endDateTime;
        }

        basePipeline.push({
          $match: {
            'activities.createdAt': activityDateFilter,
          },
        });
      }
    }

    // Se for admin, filtrar apenas processos que não possuem atividades
    if (isAdmin) {
      basePipeline.push({
        $match: {
          $or: [
            { activities: { $exists: false } },
            { activities: { $size: 0 } },
          ],
        },
      });
    }
    // Usar $facet para contar total e aplicar paginação com sort
    const pipeline = [
      ...basePipeline,
      {
        $facet: {
          data: [
            { $sort: { createdAt: -1 } }, // Sort apenas nos dados paginados
            { $skip: skip },
            { $limit: limitNum },
            {
              $project: {
                instanciasAutosWithDocs: 0,
                moviments: 0,
                documents: 0,
                formPipedrive: 0,
              },
            },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ];

    const [result] = await this.lawsuitModule
      .aggregate(pipeline)
      .allowDiskUse(true);

    const total = result.total[0]?.count || 0;
    const processes = result.data || [];

    return {
      processes,
      total,
      page: Number(page),
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }
}
