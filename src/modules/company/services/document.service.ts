import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { Model } from 'mongoose';
import { Company } from 'src/modules/process/schema/company.schema';
import { StatusDocs } from '../enum/status.enum';

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);
  // Example method to get a document by ID
  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<Company>,
  ) {}
  async execute(cnpj: string, type: string) {
    const cleanCnpj = cnpj.replace(/\D/g, '');
    try {
      if (!cnpj || !type) {
        throw new BadRequestException('CNPJ and type are required');
      }
      if (type === 'cndt') {
        await this.companyModel.updateOne(
          { cnpj: cleanCnpj },
          { $set: { cndt: { status: StatusDocs.PENDING } } },
        );
        const response = await axios.post(
          `${process.env.SCRAPING_BASE_URL}/receita-federal/cndt?cnpj=${cnpj}`,
          {},
          {
            headers: {
              Authorization: `Bearer ${process.env.SCRAPING_API_KEY}`,
            },
          },
        );
        this.logger.log(response.data);
      }
      // TODO: Implement logic to fetch document from database
    } catch (error) {
      this.logger.error(
        `Error fetching document for CNPJ: ${cnpj} of type: ${type}`,
        error.stack,
      );
      await this.companyModel.updateOne(
        { cnpj: cleanCnpj },
        { $set: { cndt: { status: StatusDocs.ERROR } } },
      );
    }
  }
}
