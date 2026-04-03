import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import axios, { AxiosError } from 'axios';
import { Model } from 'mongoose';
import { ProcessStatus } from '../../../schema/process-status.schema';
import {
  Process as ProcessEntity,
  Situation,
} from '../../../schema/process.schema';
import { Step } from '../../../schema/step.schema';
import { ProcessDecisions } from 'src/modules/process/schema/process-decisions.schema';
import { StageByCode } from 'src/modules/process/interfaces/enum';
import { PROCESSSTATUSENUM } from 'src/modules/process/enums/process-status.enum';

interface iInsertProcessData {
  processNumber: string;
  mainProcessId?: any | null;
  dealId?: number | null;
  stageId?: number | null;
  calledByInitialPetitionProvisionalNumber?: string | null;
}

@Injectable()
export class InsertProcessService {
  private readonly logger = new Logger();
  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModule: Model<ProcessEntity>,
    @InjectModel(ProcessStatus.name)
    private readonly processStatusModule: Model<ProcessStatus>,
    @InjectModel(Step.name)
    private readonly stepModule: Model<Step>,
    @InjectModel(ProcessDecisions.name)
    private readonly processDecisionModel: Model<ProcessDecisions>,
  ) {}

  async execute({
    processNumber,
    mainProcessId = null,
    dealId = null,
    stageId = null,
    calledByInitialPetitionProvisionalNumber = null,
  }: iInsertProcessData) {
    try {
      const findStep = await this.stepModule.findOne({ slug: 'step-1' });
      const processStatus = await this.processStatusModule.create({
        log: 'Esperando ser processado',
        name: 'Aguardando',
        errorReason: '',
        step: findStep._id,
      });
      if (mainProcessId) {
        const mainProcess = await this.processModule.findById(mainProcessId);
        const processCreate = await this.processModule.create({
          number: processNumber.trim(),
          processStatus: processStatus._id,
          situation: Situation.PENDING,
          processMain: mainProcess._id,
          processNumberMain: mainProcess.number,
          dealId,
          stageId,
          stage: StageByCode[stageId] || 'PRE_ANALISE',
          synchronizedAt: new Date(),
        });
        await this.fetchProcessExtract(processNumber, processCreate);
        return;
      }

      const processCreate = await this.processModule.create({
        number: processNumber.trim(),
        processStatus: processStatus._id,
        situation: Situation.PENDING,
        processMain: mainProcessId,
        calledByProvisionalLawsuitNumber:
          calledByInitialPetitionProvisionalNumber,
        dealId,
        stageId,
        stage: StageByCode[stageId] || 'PRE_ANALISE',
        synchronizedAt: new Date(),
      });
      await this.processDecisionModel.create({
        process: processCreate._id,
      });
      await this.fetchProcessExtract(processNumber, processCreate);
    } catch (error) {
      console.log('ERROR: ', error);
      throw error;
    }
  }

  async fetchProcessExtract(
    processNumber: string,
    processCreate,
    documents = true,
  ) {
    const match = processNumber.match(
      /^\d{7}-\d{2}\.\d{4}\.\d\.(\d{2})\.\d{4}$/,
    );
    const regionTRT = match ? Number(match[1]) : null;

    const url = process.env.SCRAPING_BASE_URL;
    try {
      this.logger.log(`Enviando processo ${processNumber} para a extração`);
      await axios.post(`${url}/processos/${processNumber}`, {
        documents,
        priority: true,
      });
      const logMessage = documents
        ? 'Processo enviado para o extração com documentos'
        : 'Processo enviado para a extração';
      const name = documents
        ? PROCESSSTATUSENUM.PROCESSING_WITH_DOCUMENTS
        : PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS;
      this.logger.log(logMessage);
      await this.processStatusModule.findByIdAndUpdate(
        processCreate.processStatus,
        {
          log: logMessage,
          name,
        },
      );
    } catch (error) {
      const axiosError = error as AxiosError;
      console.log(axiosError.response?.status);
      if (axiosError.response?.status === 422) {
        await this.processModule.findByIdAndUpdate(processCreate._id, {
          integrationId: (axiosError.response.data as any).async_id,
        });
        await this.processStatusModule.findByIdAndUpdate(
          processCreate.processStatus,
          {
            log: 'Processo enviado para a extração',
            name: 'Processando',
          },
        );
      } else {
        this.logger.error(
          `Erro ao enviar processo ${processNumber} para a extração`,
        );
        // await this.processModule.findByIdAndUpdate(processCreate._id, {
        //   situation: Situation.ISSUED,
        // });
        await this.processStatusModule.findByIdAndUpdate(
          processCreate.processStatus._id,
          {
            log: `Erro ao enviar processo para a extração: ${(axiosError.response?.data as { error: string })?.error}`,
            name: 'error',
          },
        );
      }
    }
  }
}
