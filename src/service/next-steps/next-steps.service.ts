import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class NextStepsService {
  private readonly logger = new Logger(NextStepsService.name);

  constructor(
    @InjectQueue('process-validation-queue')
    private readonly processValidationQueue: Queue,
    @InjectQueue('solvency-validation-queue')
    private readonly solvencyValidationQueue: Queue,
    @InjectQueue('extract-document-queue')
    private readonly extractDocumentQueue: Queue,
    @InjectQueue('initial-petition-queue')
    private readonly initialPetitionQueue: Queue,
  ) {}

  private async checkBackpressure(queue: Queue, queueName: string): Promise<void> {
    const { waiting, delayed, active } = await queue.getJobCounts();
    const pending = waiting + delayed + active;
    const rawThreshold = Number(process.env.MAX_QUEUE_PENDING ?? 500);
    const threshold = Number.isNaN(rawThreshold) ? 500 : rawThreshold;

    if (pending >= threshold) {
      this.logger.warn(
        `Backpressure: fila '${queueName}' tem ${pending} jobs pendentes (max ${threshold}). Job rejeitado.`,
      );
      throw new ServiceUnavailableException(
        `Backpressure: fila '${queueName}' tem ${pending} jobs pendentes (max ${threshold}). Job rejeitado.`,
      );
    }
  }

  async execute(step: string, data: unknown) {
    switch (step) {
      case 'step-1':
        await this.checkBackpressure(this.processValidationQueue, 'process-validation-queue');
        await this.processValidationQueue.add('process-validation', data);
        break;
      case 'step-2':
        await this.checkBackpressure(this.solvencyValidationQueue, 'solvency-validation-queue');
        await this.solvencyValidationQueue.add('solvency-validation', data);
        break;
      case 'step-3':
        await this.checkBackpressure(this.extractDocumentQueue, 'extract-document-queue');
        await this.extractDocumentQueue.add('extract-document', data);
        break;
      case 'step-4':
        await this.checkBackpressure(this.initialPetitionQueue, 'initial-petition-queue');
        await this.initialPetitionQueue.add('initial-petition', data);
        break;
      default:
        break;
    }
  }

  getQueueByStep(step: string): string | undefined {
    switch (step) {
      case 'step-1':
        return 'process-validation-queue';
      case 'step-2':
        return 'solvency-validation-queue';
      case 'step-3':
        return 'extract-document-queue';
      case 'step-4':
        return 'initial-petition-queue';
      default:
        return undefined;
    }
  }
}
