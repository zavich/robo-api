import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import { NextStepsService } from 'src/service/next-steps/next-steps.service';
import { PROCESSSTATUSENUM } from '../../enums/process-status.enum';
import { Root } from '../../interfaces/process.interface';
import { ProcessStatus } from '../../schema/process-status.schema';
import { Process as ProcessEntity, Situation } from '../../schema/process.schema';
import { Step } from '../../schema/step.schema';
import { ProcessStateMachineService } from '../process-state-machine.service';

interface PopulatedProcessStatus {
  _id: string;
  step: { slug: string };
  name?: string;
}

type ProcessWithPopulatedStatus = HydratedDocument<ProcessEntity> & {
  processStatus: PopulatedProcessStatus;
};

@Injectable()
export class WebhookNaoEncontradoHandler {
  private readonly logger = new Logger(WebhookNaoEncontradoHandler.name);

  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModel: Model<ProcessEntity>,
    @InjectModel(ProcessStatus.name)
    private readonly processStatusModel: Model<ProcessStatus>,
    private readonly nextStepsService: NextStepsService,
    private readonly processStateMachine: ProcessStateMachineService,
  ) {}

  async handle(
    body: Root,
    findProcess: ProcessEntity & { _id: string | Types.ObjectId; processStatus: { _id: string | Types.ObjectId } },
    step: Step,
    correlationId?: string,
  ): Promise<void> {
    if (findProcess.sentToRecords === 'SENT') {
      await this.processModel.updateOne(
        { _id: findProcess._id },
        { sentToRecords: 'NOT_FOUND', autosData: null },
      );
      return;
    }

    if (
      findProcess.situation === Situation.PENDING &&
      findProcess.class === 'MAIN' &&
      findProcess?.calledByProvisionalLawsuitNumber
    ) {
      const findLawsuitProvisional = await this.processModel
        .findOne({ number: findProcess.calledByProvisionalLawsuitNumber })
        .populate({ path: 'processStatus', populate: ['step'] }) as ProcessWithPopulatedStatus | null;

      if (findLawsuitProvisional?.processStatus) {
        await this.nextStepsService.execute(
          findLawsuitProvisional.processStatus.step.slug,
          {
            processNumber: findLawsuitProvisional.number,
            correlationId,
          },
        );
      }
    }

    if (findProcess?.processMain) {
      const mainProcess = await this.processModel
        .findOne({ _id: findProcess.processMain })
        .populate({ path: 'processStatus', populate: ['step'] }) as ProcessWithPopulatedStatus | null;

      if (mainProcess?.processStatus?.step.slug === 'step-3') {
        await this.nextStepsService.execute(
          mainProcess.processStatus.step.slug,
          {
            processNumber: mainProcess.number,
            correlationId,
          },
        );
        this.logger.log(
          'Processo provisorio não encontrado, seguindo com principal',
        );
      }
      return;
    }

    await this.processStateMachine.transition(
      this.processStatusModel,
      findProcess.processStatus._id,
      {
        name: PROCESSSTATUSENUM.ERROR,
        log: body.resposta.message,
        errorReason: body.resposta.message,
      },
    );
  }
}
