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
    @InjectQueue('process-queue') private readonly processQueue: Queue,
    @InjectModel(Process.name)
    private readonly processModule: Model<Process>,
  ) {}

  async execute(body: any): Promise<void> {
    try {
      const { num_processo, deal_id, stage_id } = body;

      console.log('Lawsuit: ', num_processo);
      console.log('deal id: ', deal_id);
      console.log('stage id: ', stage_id);
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
      console.error('Error on WebhookPipedriveService: ', error);
    }
  }
}
