import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { Process } from '../schema/process.schema';

@Injectable()
export class WebhookPipedriveService {
  private readonly logger = new Logger(WebhookPipedriveService.name);

  constructor(
    @InjectQueue('insert-process-queue') private readonly processQueue: Queue,
    @InjectModel(Process.name)
    private readonly processModule: Model<Process>,
  ) {}

  async execute(body: Record<string, unknown>): Promise<void> {
    try {
      const { num_processo, deal_id, stage_id } = body as { num_processo: string; deal_id: number; stage_id: number };

      this.logger.log('Lawsuit: ', num_processo);
      this.logger.log('deal id: ', deal_id);
      this.logger.log('stage id: ', stage_id);
      const findProcess = await this.processModule.findOne({
        number: num_processo,
      });

      if (findProcess) {
        this.logger.log(
          `Lawuit ${num_processo} already exists in the database`,
        );
        return;
      }

      await this.processQueue.add('insert-process', {
        processNumber: num_processo,
        dealId: deal_id,
        stageId: stage_id,
      });

      this.logger.log(
        `Lawsuit ${num_processo} inserted in the queue by pipedrive webhook`,
      );
    } catch (error) {
      this.logger.error('Error on WebhookPipedriveService: ', error);
    }
  }
}
