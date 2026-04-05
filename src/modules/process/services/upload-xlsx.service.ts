import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as XLSX from 'xlsx';
import { Process } from '../schema/process.schema';
import { CreateProcessService } from './create-process.service';

@Injectable()
export class UploadXLSXService {
  private readonly logger = new Logger(UploadXLSXService.name);

  constructor(
    @InjectModel(Process.name)
    private readonly processModel: Model<Process>,
    private readonly createProcessService: CreateProcessService,
  ) {}

  async execute(buffer: Buffer) {
    // Lê o Excel
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    const lawsuits = [];

    for (const row of rows.slice(0, 1)) {
      const lawsuit = row['Processos 2025'] ? row['Processos 2025'] : null;
      if (!lawsuit) continue;

      const jaExiste = await this.processModel.findOne({ number: lawsuit });
      this.logger.log(
        `Processo ${lawsuit} já existe? ${jaExiste ? 'Sim' : 'Não'}`,
      );
      if (!jaExiste) {
        lawsuits.push(lawsuit);
      } else {
        this.logger.log(`Processo ${lawsuit} já existe, atualizando...`);
        return;
      }
    }
    await this.createProcessService.execute({
      processes: lawsuits,
    });

    return {
      total: rows.length,
      criadas: lawsuits.length,
    };
  }
}
