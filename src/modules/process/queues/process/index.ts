import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
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

export class ProcessQueue {
  private readonly logger = new Logger();

  constructor(
    @InjectModel(ProcessSchema.name)
    private readonly processModule: Model<ProcessSchema>,
    @InjectModel(Complainant.name)
    private readonly complainantModule: Model<Complainant>,
    private readonly processValidationService: ProcessValidationService,
    private readonly solvencyValidationService: SolvencyValidationService,
    private readonly extractDocumentsInfoService: ExtractDocumentsInfoService,
    private readonly insertProcessService: InsertProcessService,
    private readonly initialPetitionService: InitialPetitionService,
  ) {}

  async insertProcess(data: InsertProceess) {
    const {
      processNumber,
      mainProcessId,
      dealId,
      stageId,
      calledByInitialPetitionProvisionalNumber,
    } = data;
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

  async processValidationJob(data: { processNumber: string }) {
    const { processNumber } = data;
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

  async solvencyValidationJob(data: { processNumber: string }) {
    try {
      const { processNumber } = data;
      this.logger.log(`Job solvency validation #${processNumber}`);
      return await this.solvencyValidationService.execute(processNumber);
    } catch (error) {
      this.logger.error(`Error in solvency validation #${data.processNumber}`);
      throw error;
    }
  }

  async extractDocumentJob(data: Root | LawsuitNumber) {
    const body = data;
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

  async initialPetitionJob(data: { processNumber?: string; resposta?: { numero_unico: string } }) {
    const { processNumber, resposta } = data;
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
