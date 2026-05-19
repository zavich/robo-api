import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class NextStepsService {
  constructor(
    @InjectQueue('insert-process-queue')
    private readonly insertProcessQueue: Queue,
    @InjectQueue('process-validation-queue')
    private readonly processValidationQueue: Queue,
    @InjectQueue('solvency-validation-queue')
    private readonly solvencyValidationQueue: Queue,
    @InjectQueue('extract-document-queue')
    private readonly extractDocumentQueue: Queue,
    @InjectQueue('initial-petition-queue')
    private readonly initialPetitionQueue: Queue,
  ) {}

  async execute(step: string, data: unknown) {
    switch (step) {
      case 'step-1':
        await this.processValidationQueue.add('process-validation', data);
        break;
      case 'step-2':
        await this.solvencyValidationQueue.add('solvency-validation', data);
        break;
      case 'step-3':
        await this.extractDocumentQueue.add('extract-document', data);
        break;
      case 'step-4':
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
