import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company } from 'src/modules/process/schema/company.schema';

@Injectable()
export class UpdateCompanyService {
  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<Company>,
  ) {}

  async execute(id: number, updateData: any): Promise<Company> {
    try {
      const company = await this.companyModel.findByIdAndUpdate(
        id,
        updateData,
        {
          new: true,
        },
      );
      if (!company) {
        throw new Error('Company not found');
      }

      return company;
    } catch (error) {
      throw new Error(error);
    }
  }
}
