import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';

@Injectable()
export class NextStepsService {
  constructor(
    @InjectQueue('process-queue')
    private readonly processQueue: Queue,
  ) {}
  async execute(step: string, data: any) {
    switch (true) {
      case step === 'step-1':
        await this.processQueue.add('process-validation', data);
        break;
      case step === 'step-2':
        await this.processQueue.add('solvency-validation', data);
        break;
      case step === 'step-3':
        await this.processQueue.add('extract-document', data);
        break;
      case step === 'step-4':
        await this.processQueue.add('initial-petition', data);
        break;
      case step === 'step-5':
        await this.processQueue.add('filter-value', data);
        break;
      case step === 'step-6':
        await this.processQueue.add('liberation', data);
        break;
      case step === 'step-7':
        await this.processQueue.add('parameters', data);
        break;
      case step === 'step-8':
        await this.processQueue.add('resources', data);
        break;
      case step === 'step-9':
        await this.processQueue.add('simple-calc', data);
        break;
      default:
        break;
    }
  }

  getQueueByStep(step: string) {
    switch (true) {
      case step === 'step-1':
        return 'process-validation';
        break;
      case step === 'step-2':
        return 'solvency-validation';
        break;
      case step === 'step-3':
        return 'extract-document';
        break;
      case step === 'step-4':
        return 'initial-petition';
        break;
      case step === 'step-5':
        return 'filter-value';
        break;
      case step === 'step-6':
        return 'liberation';
        break;
      case step === 'step-7':
        return 'parameters';
        break;
      case step === 'step-8':
        return 'resources';
        break;
      case step === 'step-9':
        return 'simple-calc';
        break;
      default:
        break;
    }
  }
}
