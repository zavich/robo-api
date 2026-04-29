import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Process as ProcessEntity } from '../../schema/process.schema';

@Injectable()
export class FindProcessService {
  private readonly logger = new Logger(FindProcessService.name);
  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModule: Model<ProcessEntity>,
  ) {}

  async execute(number, userId?: string) {
    const result = await this.processModule.aggregate([
      {
        $match: {
          number: number,
        },
      },
      {
        $lookup: {
          from: 'processstatuses',
          localField: 'processStatus',
          foreignField: '_id',
          as: 'processStatus',
        },
      },
      {
        $unwind: {
          path: '$processStatus',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'processes',
          localField: 'calledByProvisionalLawsuitNumber',
          foreignField: 'number',
          as: 'processExecution',
          pipeline: [
            {
              $project: {
                _id: 1,
                number: 1,
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: '$processExecution',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'processes',
          localField: 'number',
          foreignField: 'calledByProvisionalLawsuitNumber',
          as: 'processMain',
          pipeline: [
            {
              $project: {
                _id: 1,
                number: 1,
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: '$processMain',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'complainants',
          localField: 'complainant',
          foreignField: '_id',
          as: 'complainant',
        },
      },
      {
        $unwind: {
          path: '$complainant',
          preserveNullAndEmptyArrays: true,
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
        $unwind: {
          path: '$processDecisions',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'claimedprocesses',
          let: {
            processId: '$_id',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$processId', '$$processId'],
                },
              },
            },
            {
              $lookup: {
                from: 'companies',
                localField: 'companyId',
                foreignField: '_id',
                as: 'company',
              },
            },
            {
              $unwind: {
                path: '$company',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                _id: '$company._id',
                name: '$company.name',
                cnpj: '$company.cnpj',
                email: '$company.email',
                phone: '$company.phone',
                specialRule: '$company.specialRule',
              },
            },
          ],
          as: 'companies',
        },
      },
      {
        $lookup: {
          from: 'processowners',
          let: { processId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$processId', '$$processId'] },
                    { $eq: ['$isActive', true] },
                  ],
                },
              },
            },
            {
              $lookup: {
                from: 'users',
                localField: 'userId',
                foreignField: '_id',
                as: 'user',
              },
            },
            {
              $unwind: {
                path: '$user',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                _id: 1,
                userId: 1,
                user: {
                  _id: '$user._id',
                  email: '$user.email',
                  role: '$user.role',
                },
                isActive: 1,
              },
            },
            { $limit: 1 },
          ],
          as: 'processOwner',
        },
      },
      {
        $unwind: {
          path: '$activities',
          preserveNullAndEmptyArrays: true,
        },
      },

      // Populate assignedTo
      {
        $lookup: {
          from: 'users',
          let: { userId: '$activities.assignedTo' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
            { $project: { password: 0 } },
          ],
          as: 'assignedToObj',
        },
      },
      { $unwind: { path: '$assignedToObj', preserveNullAndEmptyArrays: true } },
      {
        $set: {
          'activities.assignedTo': '$assignedToObj',
        },
      },
      { $unset: 'assignedToObj' },

      // Populate assignedBy
      {
        $lookup: {
          from: 'users',
          let: { userId: '$activities.assignedBy' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
            { $project: { password: 0 } },
          ],
          as: 'assignedByObj',
        },
      },
      { $unwind: { path: '$assignedByObj', preserveNullAndEmptyArrays: true } },
      {
        $set: {
          'activities.assignedBy': '$assignedByObj',
        },
      },
      { $unset: 'assignedByObj' },

      // Populate completedBy
      {
        $lookup: {
          from: 'users',
          let: { userId: '$activities.completedBy' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
            { $project: { password: 0 } },
          ],
          as: 'completedByObj',
        },
      },
      {
        $unwind: { path: '$completedByObj', preserveNullAndEmptyArrays: true },
      },
      {
        $set: {
          'activities.completedBy': '$completedByObj',
        },
      },
      { $unset: 'completedByObj' },

      // Rebuild activities array
      {
        $group: {
          _id: '$_id',
          root: { $first: '$$ROOT' },
          activities: { $push: '$activities' },
          instancias: { $first: '$instancias' },
          instanciasAutos: { $first: '$instanciasAutos' },
          autosData: { $first: '$autosData' },
        },
      },

      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: ['$root', { activities: '$activities' }],
          },
        },
      },
      {
        $addFields: {
          processOwner: { $arrayElemAt: ['$processOwner', 0] },
        },
      },
      {
        $addFields: {
          // Calcula os tamanhos
          primeiroGrau: {
            $size: {
              $ifNull: [{ $arrayElemAt: ['$instancias.movimentacoes', 0] }, []],
            },
          },
          segundoGrau: {
            $size: {
              $ifNull: [{ $arrayElemAt: ['$instancias.movimentacoes', 1] }, []],
            },
          },
          tst: {
            $size: {
              $ifNull: [
                { $arrayElemAt: ['$instanciasAutos.movimentacoes', 0] },
                [],
              ],
            },
          },

          // Flag final: true se algum tamanho atual for maior que oldMoviments
          hasNewMovementsNow: {
            $cond: [
              {
                $or: [
                  { $eq: ['$oldMoviments.primeiroGrau', null] },
                  { $eq: ['$oldMoviments.segundoGrau', null] },
                  { $eq: ['$oldMoviments.tst', null] },
                ],
              },
              false, // Se algum atributo de oldMoviments for null → considera false
              {
                $or: [
                  {
                    $gt: [
                      {
                        $size: {
                          $ifNull: [
                            { $arrayElemAt: ['$instancias.movimentacoes', 0] },
                            [],
                          ],
                        },
                      },
                      { $ifNull: ['$oldMoviments.primeiroGrau', 0] },
                    ],
                  },
                  {
                    $gt: [
                      {
                        $size: {
                          $ifNull: [
                            { $arrayElemAt: ['$instancias.movimentacoes', 1] },
                            [],
                          ],
                        },
                      },
                      { $ifNull: ['$oldMoviments.segundoGrau', 0] },
                    ],
                  },
                  {
                    $gt: [
                      {
                        $size: {
                          $ifNull: [
                            {
                              $arrayElemAt: [
                                '$instanciasAutos.movimentacoes',
                                0,
                              ],
                            },
                            [],
                          ],
                        },
                      },
                      { $ifNull: ['$oldMoviments.tst', 0] },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    ]);
    const process = result[0];

    // Adicionar campo isReadByUser se userId for fornecido
    if (process && userId) {
      process.isReadByUser = !process.unreadByUsers?.includes(userId);
    } else if (process) {
      process.isReadByUser = true; // Default para usuários não autenticados
    }

    return process;
  }
}
