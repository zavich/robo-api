import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company } from 'src/modules/process/schema/company.schema';
import { StatusDocs } from '../enum/status.enum';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<Company>,
  ) {}
  // Example: Handle incoming webhook payload
  async execute(payload: any, type: string) {
    try {
      this.logger.log(`Received webhook of type: ${type}`, payload);
      const cleanCnpj = payload.cnpj.replace(/\D/g, '');
      const findCompany = await this.companyModel.findOne({
        cnpj: cleanCnpj,
      });
      if (!findCompany) {
        throw new BadRequestException('Company not found');
      }

      await this.companyModel.findByIdAndUpdate(findCompany._id, {
        $set: {
          cndt: {
            status: StatusDocs.CONCLUDED,
            temp_link: payload.temp_link,
          },
        },
      });
    } catch (error) {
      throw new BadRequestException('Invalid webhook payload');
    }
    // Process the webhook payload here
    // e.g., validate, transform, save to database, etc.
  }
}
