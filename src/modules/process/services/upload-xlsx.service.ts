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
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // pega tudo como matriz (igual frontend)
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const processNumberRegex = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;

    const foundProcesses: string[] = [];

    // 🔥 Extrai todos os processos de qualquer coluna
    for (const row of rows) {
      if (!row || !row.length) continue;

      for (const cell of row) {
        if (typeof cell === 'string' && processNumberRegex.test(cell.trim())) {
          foundProcesses.push(cell.trim());
        }
      }
    }

    // remove duplicados
    const uniqueProcesses = [...new Set(foundProcesses)];

    if (!uniqueProcesses.length) {
      return {
        total: rows.length,
        criadas: 0,
        message: 'Nenhum processo válido encontrado',
      };
    }

    // 🔥 busca todos de uma vez (performance)
    const existing = await this.processModel
      .find({ number: { $in: uniqueProcesses } })
      .select('number')
      .lean();

    const existingNumbers = new Set(existing.map((e) => e.number));

    const newProcesses = uniqueProcesses.filter(
      (num) => !existingNumbers.has(num),
    );

    const duplicatedProcesses = uniqueProcesses.filter((num) =>
      existingNumbers.has(num),
    );

    // 🔥 chama seu service
    if (newProcesses.length) {
      await this.createProcessService.execute({
        processes: newProcesses,
      });
    }

    return {
      totalLinhas: rows.length,
      encontrados: uniqueProcesses.length,
      criados: newProcesses.length,
      duplicados: duplicatedProcesses.length,
    };
  }
}
