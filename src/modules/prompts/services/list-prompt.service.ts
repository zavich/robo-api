import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Prompt } from 'src/modules/process/schema/prompt.schema';
import { ListPromptDto } from '../dtos/list-prompt.dto';

@Injectable()
export class ListPromptService {
  constructor(
    @InjectModel(Prompt.name)
    private readonly promptModule: Model<Prompt>,
  ) {}

  async execute(query: ListPromptDto) {
    const { page = 1, limit, search } = query;

    try {
      const pipeline: any[] = [];

      // Filtro de busca por nome ou texto do prompt
      if (search && search.trim() !== '') {
        pipeline.push({
          $match: {
            $or: [
              { name: { $regex: search, $options: 'i' } },
              { text: { $regex: search, $options: 'i' } },
            ],
          },
        });
      }

      // Configurar pipeline baseado se tem limit ou não
      if (limit) {
        // Com paginação
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

        const [result] = await this.promptModule.aggregate(pipeline);
        const prompts = result.data || [];
        const total = result.total[0]?.count || 0;

        return {
          prompts,
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        };
      } else {
        // Sem paginação - retornar todos os registros
        pipeline.push({ $sort: { createdAt: -1 } });

        const prompts = await this.promptModule.aggregate(pipeline);
        const total = prompts.length;

        return {
          prompts,
          total,
          page: 1,
          limit: null,
          totalPages: 1,
        };
      }
    } catch (error) {
      throw error;
    }
  }
}
