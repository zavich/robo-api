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
  ) {}

  async handle(
    body: Root,
    findProcess: ProcessEntity & { _id: string; processStatus: { _id: string } },
  ): Promise<void> {
    const currentRetries = findProcess.scraperRetryCount ?? 0;

    if (currentRetries < MAX_SCRAPER_RETRIES) {
      await this.processModel.findByIdAndUpdate(findProcess._id, {
        $inc: { scraperRetryCount: 1 },
      });
      await this.processQueue.add(
        'process-validation',
        { processNumber: body.numero_processo },
        { delay: RETRY_DELAY_MS, attempts: 1 },
      );
      this.logger.warn(
        `TRT inacessivel para ${body.numero_processo}. Retry ${currentRetries + 1}/${MAX_SCRAPER_RETRIES} agendado em 5min.`,
      );
      return;
    }

    await this.processStatusModel.findByIdAndUpdate(findProcess.processStatus, {
      name: PROCESSSTATUSENUM.ERROR,
      log: '',
      errorReason: AnaliseStatus.TRT_INACESSIVEL,
    });
  }
}
