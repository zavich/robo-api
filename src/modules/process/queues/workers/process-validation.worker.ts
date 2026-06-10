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

interface PartePrincipal {
  tipo: string;
  principal: boolean;
  nome?: string;
  documento?: { tipo?: string; numero?: string };
  [key: string]: unknown;
}

interface InstanciaItem {
  instancia: string;
  movimentacoes: Record<string, unknown>[];
  partes: PartePrincipal[];
  classe?: string;
  [key: string]: unknown;
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
        (instancia as InstanciaItem).movimentacoes.map((moviment) => ({
          ...moviment,
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
    const autores = (instancia: Record<string, unknown>) =>
      (instancia as InstanciaItem).partes?.find(
        (item: PartePrincipal) =>
          authorKeywords.some((keyword) =>
            item.tipo?.toLowerCase().includes(keyword),
          ) && item.principal,
      );
    const primeiroGrau = process.instancias?.find(
      (instancia) => instancia.instancia === 'PRIMEIRO_GRAU',
    );
    const autor = primeiroGrau ? autores(primeiroGrau) : undefined;

    if (!autor) {
      this.logger.warn(`Sem "AUTOR" para o processo #${process.number}`);
      return;
    }

    const createComplainant = await this.complainantModule.findOneAndUpdate(
      { name: autor.nome, cpf: autor.documento?.numero },
      { $set: { name: autor.nome, cpf: autor.documento?.numero } },
      { upsert: true, new: true },
    );

    const classProcess = primeiroGrau
      ? (primeiroGrau as InstanciaItem).classe
      : undefined;

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
