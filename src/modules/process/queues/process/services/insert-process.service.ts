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
import { ProcessStateMachineService } from 'src/modules/process/services/process-state-machine.service';

interface iInsertProcessData {
  processNumber: string;
  mainProcessId?: string | null;
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
    private readonly processStateMachine: ProcessStateMachineService,
  ) {}

  async execute({
    processNumber,
    mainProcessId = null,
    dealId = null,
    stageId = null,
    calledByInitialPetitionProvisionalNumber = null,
  }: iInsertProcessData) {
    try {
      const findProcess = await this.processModule.findOne({
        number: processNumber,
      });
      if (findProcess) {
        this.logger.warn(
          `Processo ${processNumber} já existe na base de dados`,
        );
        return;
      }
      const findStep = await this.stepModule.findOne({ slug: 'step-1' });
      const processStatus = await this.processStatusModule.create({
        log: 'Esperando ser processado',
        name: PROCESSSTATUSENUM.PENDING,
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
      this.logger.error('Erro ao inserir processo:', error);
      throw error;
    }
  }

  async fetchProcessExtract(
    processNumber: string,
    processCreate,
    documents = true,
  ) {
    try {
      this.logger.log(`Enviando processo ${processNumber} para a extração`);
      await axios.post(
        `${process.env.SCRAPING_BASE_URL}/processos/${processNumber}`,
        {
          documents,
          priority: true,
        },
      );
      const logMessage = documents
        ? 'Processo enviado para o extração com documentos'
        : 'Processo enviado para a extração';
      const name = documents
        ? PROCESSSTATUSENUM.PROCESSING_WITH_DOCUMENTS
        : PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS;
      this.logger.log(logMessage);
      await this.processStateMachine.transition(
        this.processStatusModule,
        processCreate.processStatus,
        {
          log: logMessage,
          name,
        },
      );
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.debug(`HTTP ${axiosError.response?.status ?? 'sem status'} ao enviar para extração`);
      if (axiosError.response?.status === 422) {
        await this.processModule.findByIdAndUpdate(processCreate._id, {
          integrationId: (axiosError.response.data as { async_id?: string }).async_id,
        });
        await this.processStateMachine.transition(
          this.processStatusModule,
          processCreate.processStatus,
          {
            log: 'Processo enviado para a extração',
            name: documents
              ? PROCESSSTATUSENUM.PROCESSING_WITH_DOCUMENTS
              : PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS,
          },
        );
      } else {
        this.logger.error(
          `Erro ao enviar processo ${processNumber} para a extração`,
        );
        // await this.processModule.findByIdAndUpdate(processCreate._id, {
        //   situation: Situation.ISSUED,
        // });
        await this.processStateMachine.transition(
          this.processStatusModule,
          processCreate.processStatus,
          {
            log: `Erro ao enviar processo para a extração: ${(axiosError.response?.data as { error: string })?.error}`,
            name: PROCESSSTATUSENUM.ERROR,
          },
        );
      }
    }
  }
}
