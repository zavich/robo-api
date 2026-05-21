import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { AnaliseStatus } from 'src/utils/enum';
import { PROCESSSTATUSENUM } from '../../enums/process-status.enum';
import { Root } from '../../interfaces/process.interface';
import { ProcessStatus } from '../../schema/process-status.schema';
import { Process as ProcessEntity } from '../../schema/process.schema';
import { ProcessStateMachineService } from '../process-state-machine.service';

const MAX_SCRAPER_RETRIES = 3;
const RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class WebhookErroHandler {
  private readonly logger = new Logger(WebhookErroHandler.name);

  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModel: Model<ProcessEntity>,
    @InjectModel(ProcessStatus.name)
    private readonly processStatusModel: Model<ProcessStatus>,
    @InjectQueue('process-validation-queue')
    private readonly processQueue: Queue,
    private readonly processStateMachine: ProcessStateMachineService,
  ) {}

  async handle(
    body: Root,
    findProcess: ProcessEntity & { _id: string; processStatus: { _id: string } },
    correlationId?: string,
  ): Promise<void> {
    const updatedProcess = await this.processModel.findOneAndUpdate(
      {
        _id: findProcess._id,
        $or: [
          { scraperRetryCount: { $exists: false } },
          { scraperRetryCount: { $lt: MAX_SCRAPER_RETRIES } },
        ],
      },
      {
        $inc: { scraperRetryCount: 1 },
      },
      { new: true },
    );

    if (updatedProcess) {
      const currentRetries = updatedProcess.scraperRetryCount ?? 1;
      await this.processQueue.add(
        'process-validation',
        {
          processNumber: body.numero_processo,
          correlationId,
        },
        { delay: RETRY_DELAY_MS, attempts: 1 },
      );
      this.logger.warn(
        `TRT inacessivel para ${body.numero_processo}. Retry ${currentRetries}/${MAX_SCRAPER_RETRIES} agendado em 5min.`,
      );
      return;
    }

    await this.processStateMachine.transition(
      this.processStatusModel,
      findProcess.processStatus,
      {
        name: PROCESSSTATUSENUM.ERROR,
        log: '',
        errorReason: AnaliseStatus.TRT_INACESSIVEL,
      },
    );
  }
}
