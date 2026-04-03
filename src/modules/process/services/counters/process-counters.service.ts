import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Process as ProcessEntity } from '../../schema/process.schema';
import { LossReasonsService } from '../loss-reasons-service';

@Injectable()
export class ProcessCountersService {
  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModel: Model<ProcessEntity>,
    private readonly lossReasonsService: LossReasonsService,
  ) {}

  async execute(query: any = {}) {
    const {
      search,
      status,
      startDate,
      endDate,
      lossReason,
      emptyDocuments,
      emptyInstances,
      hasNewMovements: hasNewMovementsRaw,
    } = query;

    // Converter hasNewMovements para boolean corretamente
    let hasNewMovements: boolean | undefined = undefined;
    if (hasNewMovementsRaw !== undefined) {
      if (typeof hasNewMovementsRaw === 'string') {
        hasNewMovements = hasNewMovementsRaw === 'true';
      } else {
        hasNewMovements = Boolean(hasNewMovementsRaw);
      }
    }

    const initialMatch: any = { stageId: { $ne: null } };
    const dateFilter: any = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      dateFilter.$lte = endDateTime;
    }
    if (Object.keys(dateFilter).length > 0) initialMatch.createdAt = dateFilter;

    const searchMatch: any = {};
    if (search && search.trim() !== '') {
      searchMatch.$or = [
        { number: { $regex: search, $options: 'i' } },
        { 'processParts.nome': { $regex: search, $options: 'i' } },
      ];
    } else if (status && status.trim() !== '') {
      searchMatch.situation = { $regex: status, $options: 'i' };
    }

    let lossReasonFilter: any = {};
    let needsLatestHistoryField = false;

    if (lossReason) {
      const reasons = Array.isArray(lossReason) ? lossReason : [lossReason];
      const validReasons = reasons.filter((r) => r && r.trim() !== '');

      if (validReasons.length > 0) {
        needsLatestHistoryField = true;

        if (validReasons.length === 1) {
          const normalizedLossReason = this.normalizeLossReason(validReasons[0]);
          lossReasonFilter = {
            'processDecisions.latestHistory.rejection_reason': {
              $regex: normalizedLossReason,
              $options: 'i',
            },
          };
        } else {
          const normalizedReasons = validReasons.map((r) =>
            this.normalizeLossReason(r),
          );
          lossReasonFilter = {
            $or: normalizedReasons.map((reason) => ({
              'processDecisions.latestHistory.rejection_reason': {
                $regex: reason,
                $options: 'i',
              },
            })),
          };
        }
      }
    }

    const emptyFilters: any = {};
    if (emptyDocuments !== undefined)
      emptyFilters.isDocuments = !emptyDocuments;
    if (emptyInstances !== undefined)
      emptyFilters.isInstancias = !emptyInstances;

    // Pipeline base comum a todos os stages
    const basePipeline = [
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

      // Filtro de movimentações novas
      ...(hasNewMovements !== undefined
        ? [
            {
              $match: {
                hasNewMovements: hasNewMovements,
              },
            },
          ]
        : []),

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
        $lookup: {
          from: 'processdecisions',
          localField: '_id',
          foreignField: 'process_id',
          as: 'processDecisions',
        },
      },
      {
        $addFields: {
          processDecisions: { $arrayElemAt: ['$processDecisions', 0] },
        },
      },
      // Adicionar campo com o último item do histórico (se necessário)
      ...(needsLatestHistoryField
        ? [
            {
              $addFields: {
                'processDecisions.latestHistory': {
                  $arrayElemAt: ['$processDecisions.history', -1],
                },
              },
            },
          ]
        : []),
      ...(Object.keys(lossReasonFilter).length > 0
        ? [{ $match: lossReasonFilter }]
        : []),
    ];

    const pipeline = [
      ...basePipeline,
      {
        $facet: {
          // Contadores para PRE_ANALISE
          PRE_ANALISE: [
            { $match: { stage: 'PRE_ANALISE' } },
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                instanciasCount: {
                  $sum: { $cond: ['$isInstancias', 1, 0] },
                },
                documentsCount: {
                  $sum: { $cond: ['$isDocuments', 1, 0] },
                },
                pendingCount: {
                  $sum: { $cond: [{ $eq: ['$situation', 'PENDING'] }, 1, 0] },
                },
                approvedCount: {
                  $sum: { $cond: [{ $eq: ['$situation', 'APPROVED'] }, 1, 0] },
                },
                rejectedCount: {
                  $sum: { $cond: [{ $eq: ['$situation', 'LOSS'] }, 1, 0] },
                },
              },
            },
          ],
          // Contadores para ANALISE
          ANALISE: [
            { $match: { stage: 'ANALISE' } },
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                instanciasCount: {
                  $sum: { $cond: ['$isInstancias', 1, 0] },
                },
                documentsCount: {
                  $sum: { $cond: ['$isDocuments', 1, 0] },
                },
                pendingCount: {
                  $sum: { $cond: [{ $eq: ['$situation', 'PENDING'] }, 1, 0] },
                },
                approvedCount: {
                  $sum: { $cond: [{ $eq: ['$situation', 'APPROVED'] }, 1, 0] },
                },
                rejectedCount: {
                  $sum: { $cond: [{ $eq: ['$situation', 'LOSS'] }, 1, 0] },
                },
              },
            },
          ],
          // Contadores para CALCULO
          CALCULO: [
            { $match: { stage: 'CALCULO' } },
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                instanciasCount: {
                  $sum: { $cond: ['$isInstancias', 1, 0] },
                },
                documentsCount: {
                  $sum: { $cond: ['$isDocuments', 1, 0] },
                },
                pendingCount: {
                  $sum: { $cond: [{ $eq: ['$situation', 'PENDING'] }, 1, 0] },
                },
                approvedCount: {
                  $sum: { $cond: [{ $eq: ['$situation', 'APPROVED'] }, 1, 0] },
                },
                rejectedCount: {
                  $sum: { $cond: [{ $eq: ['$situation', 'LOSS'] }, 1, 0] },
                },
              },
            },
          ],
          // Contadores gerais (todos os estágios)
          GENERAL: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                instanciasCount: {
                  $sum: { $cond: ['$isInstancias', 1, 0] },
                },
                documentsCount: {
                  $sum: { $cond: ['$isDocuments', 1, 0] },
                },
                pendingCount: {
                  $sum: { $cond: [{ $eq: ['$situation', 'PENDING'] }, 1, 0] },
                },
                approvedCount: {
                  $sum: { $cond: [{ $eq: ['$situation', 'APPROVED'] }, 1, 0] },
                },
                rejectedCount: {
                  $sum: { $cond: [{ $eq: ['$situation', 'LOSS'] }, 1, 0] },
                },
              },
            },
          ],
        },
      },
    ];

    const result = await this.processModel
      .aggregate(pipeline)
      .allowDiskUse(true);

    const data = result[0] || {};

    return {
      PRE_ANALISE: {
        total: data.PRE_ANALISE?.[0]?.total || 0,
        instanciasCount: data.PRE_ANALISE?.[0]?.instanciasCount || 0,
        documentsCount: data.PRE_ANALISE?.[0]?.documentsCount || 0,
        pendingCount: data.PRE_ANALISE?.[0]?.pendingCount || 0,
        approvedCount: data.PRE_ANALISE?.[0]?.approvedCount || 0,
        rejectedCount: data.PRE_ANALISE?.[0]?.rejectedCount || 0,
      },
      ANALISE: {
        total: data.ANALISE?.[0]?.total || 0,
        instanciasCount: data.ANALISE?.[0]?.instanciasCount || 0,
        documentsCount: data.ANALISE?.[0]?.documentsCount || 0,
        pendingCount: data.ANALISE?.[0]?.pendingCount || 0,
        approvedCount: data.ANALISE?.[0]?.approvedCount || 0,
        rejectedCount: data.ANALISE?.[0]?.rejectedCount || 0,
      },
      CALCULO: {
        total: data.CALCULO?.[0]?.total || 0,
        instanciasCount: data.CALCULO?.[0]?.instanciasCount || 0,
        documentsCount: data.CALCULO?.[0]?.documentsCount || 0,
        pendingCount: data.CALCULO?.[0]?.pendingCount || 0,
        approvedCount: data.CALCULO?.[0]?.approvedCount || 0,
        rejectedCount: data.CALCULO?.[0]?.rejectedCount || 0,
      },
      GENERAL: {
        total: data.GENERAL?.[0]?.total || 0,
        instanciasCount: data.GENERAL?.[0]?.instanciasCount || 0,
        documentsCount: data.GENERAL?.[0]?.documentsCount || 0,
        pendingCount: data.GENERAL?.[0]?.pendingCount || 0,
        approvedCount: data.GENERAL?.[0]?.approvedCount || 0,
        rejectedCount: data.GENERAL?.[0]?.rejectedCount || 0,
      },
    };
  }

  /**
   * Normaliza o filtro de motivo de perda para aceitar tanto códigos quanto textos completos
   * @param lossReason - Motivo de perda (pode ser código como "RISCO_TESE" ou texto como "ANÁLISE – RISCO DE TESE")
   * @returns Texto normalizado para busca
   */
  private normalizeLossReason(lossReason: string): string {
    if (!lossReason || lossReason.trim() === '') {
      return '';
    }

    const trimmedReason = lossReason.trim();

    // Buscar nos motivos de perda se o input é um código
    const allReasons = this.lossReasonsService.execute();
    const foundReason = allReasons.find(
      (reason) => reason.key.toLowerCase() === trimmedReason.toLowerCase(),
    );

    if (foundReason) {
      // Se encontrou um código, retorna o label correspondente
      return foundReason.label;
    }

    // Se não encontrou um código, assume que é o texto completo e retorna como está
    return trimmedReason;
  }
}
