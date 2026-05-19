import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { Company } from 'src/modules/process/schema/company.schema';

interface ListCompanyQuery {
  page?: number | string;
  limit?: number | string;
  search?: string;
}

@Injectable()
export class ListCompanyService {
  constructor(
    @InjectModel(Company.name)
    private readonly companyRepository: Model<Company>,
  ) {}

  async execute(query: ListCompanyQuery) {
    const { page = 1, limit = 10, search } = query;

    const pipeline: PipelineStage[] = [];

    if (search && search.trim() !== '') {
      pipeline.push({
        $match: {
          $or: [
            { cnpj: { $regex: search, $options: 'i' } },
            { name: { $regex: search, $options: 'i' } },
          ],
        },
      });
    }

    pipeline.push(
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $skip: (Number(page) - 1) * Number(limit),
      },
      {
        $limit: Number(limit),
      },
    );

    // Count pipeline
    const countPipeline: PipelineStage[] = [];
    if (search && search.trim() !== '') {
      countPipeline.push({
        $match: {
          $or: [
            { cnpj: { $regex: search, $options: 'i' } },
            { name: { $regex: search, $options: 'i' } },
          ],
        },
      });
    }
    countPipeline.push({
      $count: 'total',
    });

    const companies = await this.companyRepository.aggregate(pipeline);
    const countResult = await this.companyRepository.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;
    return {
      companies,
      totalCount: total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    };
  }
}
