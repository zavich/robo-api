import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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

  async execute(payload: Record<string, unknown>, type: string) {
    this.logger.log(
      `Received webhook of type: ${type} cnpj=${typeof payload.cnpj === 'string' ? payload.cnpj : 'n/a'}`,
    );

    // Validacao de payload — antes era type assertion bruta e tudo caia em
    // "Invalid webhook payload", mascarando inclusive Company not found.
    if (typeof payload.cnpj !== 'string' || !payload.cnpj.trim()) {
      throw new BadRequestException(
        'Invalid webhook payload: "cnpj" obrigatorio',
      );
    }
    if (typeof payload.temp_link !== 'string' || !payload.temp_link.trim()) {
      throw new BadRequestException(
        'Invalid webhook payload: "temp_link" obrigatorio',
      );
    }

    const cleanCnpj = payload.cnpj.replace(/\D/g, '');

    try {
      const findCompany = await this.companyModel.findOne({ cnpj: cleanCnpj });
      if (!findCompany) {
        throw new NotFoundException(`Company not found for cnpj=${cleanCnpj}`);
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
      // Preserva HttpException (BadRequest/NotFound) com a mensagem real.
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Erro inesperado no webhook company (${type}/${cleanCnpj}): ${error instanceof Error ? error.stack : String(error)}`,
      );
      throw new BadRequestException(
        'Falha ao processar webhook (erro inesperado)',
      );
    }
  }
}
