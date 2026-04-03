import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company } from 'src/modules/process/schema/company.schema';

@Injectable()
export class FindCompanyService {
  constructor(
    @InjectModel(Company.name)
    private readonly companyRepository: Model<Company>,
  ) {}

  async execute(cnpj: string) {
    const cleanCnpj = cnpj.replace(/\D/g, '');

    const company = await this.companyRepository.findOne({ cnpj: cleanCnpj });
    return company;
  }
}
