import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SolvencyValidationService } from '../process/services/solvency-validation.service';

interface SolvencyValidationJobData {
  processNumber: string;
}

@Processor('solvency-validation-queue')
export class SolvencyValidationWorker extends WorkerHost {
  private readonly logger = new Logger(SolvencyValidationWorker.name);

  constructor(
    private readonly solvencyValidationService: SolvencyValidationService,
  ) {
    super();
  }

  async process(job: Job<SolvencyValidationJobData>): Promise<void> {
    const { processNumber } = job.data;
    this.logger.log(`Validando solvência do processo #${processNumber}`);
    try {
      await this.solvencyValidationService.execute(processNumber);
    } catch (error) {
      this.logger.error(`Erro na validação de solvência #${processNumber}`, error);
      throw error;
    }
  }
}
