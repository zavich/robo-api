import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model } from 'mongoose';
import { Complainant } from '../../schema/complainant.schema';
import { Process as ProcessSchema } from '../../schema/process.schema';
import { ProcessValidationService } from '../process/services/process-validation.service';

interface ProcessValidationJobData {
  processNumber: string;
}

@Processor('process-validation-queue')
export class ProcessValidationWorker extends WorkerHost {
  private readonly logger = new Logger(ProcessValidationWorker.name);

  constructor(
    @InjectModel(ProcessSchema.name)
    private readonly processModule: Model<ProcessSchema>,
    @InjectModel(Complainant.name)
    private readonly complainantModule: Model<Complainant>,
    private readonly processValidationService: ProcessValidationService,
  ) {
    super();
  }

  async process(job: Job<ProcessValidationJobData>): Promise<void> {
    const { processNumber } = job.data;
    this.logger.log(`Validando processo #${processNumber}`);
    try {
      const findProcess = await this.processModule.findOne({
        number: processNumber,
      });
      if (!findProcess) {
        throw new Error(`Processo não encontrado: ${processNumber}`);
      }
      await this.createOrUpdateComplainant(findProcess);
      await this.processValidationService.execute(findProcess.number);
    } catch (error) {
      this.logger.error(`Erro na validação do processo #${processNumber}`, error);
      throw error;
    }
  }

  private async createOrUpdateComplainant(process: ProcessSchema): Promise<void> {
    const moviments =
      process.instancias?.flatMap((instancia) =>
        (instancia.movimentacoes as unknown[]).map((moviment) => ({
          ...(moviment as Record<string, unknown>),
          instancia: instancia.instancia,
        })),
      ) || [];

    const authorKeywords = [
      'autor',
      'reclamante',
      'requerente',
      'polo ativo',
      'exequente',
    ];
    const autores = (process.instancias
      ?.find((instancia) => instancia.instancia === 'PRIMEIRO_GRAU')
      ?.partes as unknown[] | undefined)?.find(
        (item: any) =>
          authorKeywords.some((keyword) =>
            item.tipo?.toLowerCase().includes(keyword),
          ) && item.principal,
      );

    if (!autores) {
      this.logger.warn(`Sem "AUTOR" para o processo #${process.number}`);
      return;
    }

    const createComplainant = await this.complainantModule.findOneAndUpdate(
      { name: (autores as any)?.nome, cpf: (autores as any)?.documento?.numero },
      { $set: { name: (autores as any)?.nome, cpf: (autores as any)?.documento?.numero } },
      { upsert: true, new: true },
    );

    const classProcess = process.instancias?.find(
      (instancia) => instancia.instancia === 'PRIMEIRO_GRAU',
    )?.classe;

    await this.processModule.updateOne(
      { number: process.number },
      {
        $set: {
          legalNature: classProcess,
          complainant: createComplainant?._id,
          moviments,
        },
      },
      { upsert: true },
    );

    this.logger.log(`Processo #${process.number} atualizado com sucesso`);
  }
}
