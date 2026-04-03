import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job, Queue } from 'bull';
import { Model } from 'mongoose';
import {
  InsertProceess,
  LawsuitNumber,
  Root,
} from '../../interfaces/process.interface';
import { Complainant } from '../../schema/complainant.schema';
import { Process as ProcessSchema } from '../../schema/process.schema';

import { ExtractDocumentsInfoService } from './services/extract-documents-info.service';
import { InitialPetitionService } from './services/initial-petition.service';
import { InsertProcessService } from './services/insert-process.service';
import { ProcessValidationService } from './services/process-validation.service';
import { SolvencyValidationService } from './services/solvency-validation.service';

@Processor('process-queue')
export class ProcessQueue {
  private readonly logger = new Logger();
  constructor(
    @InjectQueue('process-queue') private readonly processQueue: Queue,
    @InjectModel(ProcessSchema.name)
    private readonly processModule: Model<ProcessSchema>,
    @InjectModel(Complainant.name)
    private readonly complainantModule: Model<Complainant>,
    private readonly processValidationService: ProcessValidationService,
    private readonly solvencyValidationService: SolvencyValidationService,
    private readonly extractDocumentsInfoService: ExtractDocumentsInfoService,
    private readonly insertProcessService: InsertProcessService,
    private readonly initialPetitionService: InitialPetitionService,
  ) {
    this.processQueue.on('waiting', (jobId) =>
      console.log('Job aguardando:', jobId),
    );
    this.processQueue.on('active', (job) =>
      console.log('Job ativo:', job.id, job.name),
    );
    this.processQueue.on('completed', (job) =>
      console.log('Job concluído:', job.id),
    );
    this.processQueue.on('failed', (job, err) =>
      console.error('Job falhou:', job.id, err),
    );
  }

  @Process({
    name: 'insert-process',
    concurrency: 5,
  })
  async insertProcess(job: Job<InsertProceess>) {
    const {
      processNumber,
      mainProcessId,
      dealId,
      stageId,
      calledByInitialPetitionProvisionalNumber,
    } = job.data;
    try {
      await this.insertProcessService.execute({
        processNumber,
        mainProcessId,
        dealId,
        stageId,
        calledByInitialPetitionProvisionalNumber,
      });
    } catch (error) {
      this.logger.error(`Error in insert process #${processNumber}`);
      throw error;
    }
  }
  @Process('process-validation')
  async processValidationJob(job: Job<any>) {
    const { processNumber } = job.data;
    this.logger.log(`Job initial process analysis #${processNumber}`);
    try {
      const findProcess = await this.processModule.findOne({
        number: processNumber,
      });
      await this.createOrUpdateComplainant(findProcess);
      await this.processValidationService.execute(findProcess.number);
    } catch (error) {
      this.logger.error(`Error in initial process analysis #${processNumber}`);
      throw error;
    }
  }
  @Process('solvency-validation')
  async solvencyValidationJob(job: Job<any>) {
    try {
      const { processNumber } = job.data;
      this.logger.log(`Job solvency validation #${processNumber}`);
      return await this.solvencyValidationService.execute(processNumber);
    } catch (error) {
      this.logger.error(
        `Error in solvency validation #${job.data.processNumber}`,
      );
      throw error;
    }
  }
  @Process({
    name: 'extract-document',
    concurrency: 1,
  })
  async extractDocumentJob(job: Job<Root | LawsuitNumber>) {
    const body = job.data;
    // console.log('body: ', body);
    let processFound;
    if ('resposta' in body) {
      processFound = await this.processModule
        .findOne({
          number: body?.resposta?.numero_unico,
        })
        .populate(['processStatus']);
    } else {
      processFound = await this.processModule
        .findOne({
          number: body?.processNumber,
        })
        .populate(['processStatus']);
    }
    await this.extractDocumentsInfoService.execute(processFound.number);
    this.logger.log('FINISH EXTRACT DOCUMENT JOB');
  }
  @Process({ name: 'initial-petition' })
  async initialPetitionJob(job: Job<any>) {
    const { processNumber, resposta } = job.data;
    await this.initialPetitionService.execute(
      processNumber || resposta.numero_unico,
    );
  }

  async createOrUpdateComplainant(process) {
    const moviments =
      process.instancias?.flatMap((instancia) =>
        instancia.movimentacoes.map((moviment) => ({
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
    const autores = process.instancias
      ?.find((instancia) => instancia.instancia === 'PRIMEIRO_GRAU')
      ?.partes?.find(
        (item) =>
          authorKeywords.some((keyword) =>
            item.tipo?.toLowerCase().includes(keyword),
          ) && item.principal,
      );

    if (!autores) {
      this.logger.warn(`No "AUTOR" found for process #${process.number}`);
      return;
    }

    // Upsert complainant
    const createComplainant = await this.complainantModule.findOneAndUpdate(
      {
        name: autores?.nome,
        cpf: autores?.documento?.numero,
      },
      {
        $set: {
          name: autores?.nome,
          cpf: autores?.documento?.numero,
        },
      },
      {
        upsert: true, // Cria o documento caso não exista
        new: true, // Retorna o documento atualizado ou criado
      },
    );

    // Update process
    const classProcess = process.instancias?.find(
      (instancia) => instancia.instancia === 'PRIMEIRO_GRAU',
    )?.classe;

    await this.processModule.updateOne(
      { number: process.number },
      {
        $set: {
          legalNature: classProcess,
          complainant: createComplainant?._id,
          moviments: moviments,
        },
      },
      { upsert: true },
    );

    this.logger.log(`Process #${process.number} updated successfully`);
  }
}
