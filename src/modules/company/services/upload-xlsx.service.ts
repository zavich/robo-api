import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company } from 'src/modules/process/schema/company.schema';
import * as XLSX from 'xlsx';
import { SharePointService } from './sharepoint.service';

@Injectable()
export class UploadXLSXCompanyService {
  private readonly logger = new Logger(UploadXLSXCompanyService.name);

  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<Company>,
    private readonly sharepointService: SharePointService,
  ) {}

  async execute() {
    // 🔥 BAIXA A PLANILHA DIRETO DO SHAREPOINT!
    const buffer = await this.sharepointService.downloadSolvenciaXLSX();

    // Lê o Excel
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);

    const empresasCriadas = [];
    const empresasAtualizadas = [];

    for (const row of rows) {
      const cnpjRaw = row['CNPJ'];
      const cnpj = cnpjRaw
        ? cnpjRaw.toString().replace(/\D/g, '')
        : null;
      if (!cnpj) continue;

      const jaExiste = await this.companyModel.findOne({ cnpj });

      const solvencia = row['SOLVÊNCIA'] as string | undefined;
      const dataToUpdate = {
        fantasyName: (row['RECLAMADA '] || row['RECLAMADA'] || null) as string | null,
        name: (row['RECLAMADA '] || row['RECLAMADA'] || null) as string | null,
        reason: (row['EXPLICAÇÃO'] || null) as string | null,
        specialRule: solvencia?.trim().toLowerCase() || null,
        score:
          typeof row['SCORE'] === 'number'
            ? row['SCORE']
            : typeof row['SCORE '] === 'number'
              ? row['SCORE '] as number
              : null,
      };
      this.logger.log(
        `Processando CNPJ: ${cnpj} - ${dataToUpdate.fantasyName}`,
      );
      if (!jaExiste) {
        const novaEmpresa = {
          cnpj,
          ...dataToUpdate,
          faturamento: (row['FATURAMENTO'] || null) as string | null,
        };

        await this.companyModel.create(novaEmpresa);
        empresasCriadas.push(novaEmpresa);
      } else {
        await this.companyModel.updateOne({ cnpj }, { $set: dataToUpdate });
        empresasAtualizadas.push(cnpj);
      }
    }

    return {
      total: rows.length,
      criadas: empresasCriadas.length,
      atualizadas: empresasAtualizadas.length,
    };
  }
}
