import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InsertProceess } from '../../interfaces/process.interface';
import { InsertProcessService } from '../process/services/insert-process.service';

@Processor('insert-process-queue')
export class InsertProcessWorker extends WorkerHost {
  private readonly logger = new Logger(InsertProcessWorker.name);

  constructor(private readonly insertProcessService: InsertProcessService) {
    super();
  }

  async process(job: Job<InsertProceess>): Promise<void> {
    const {
      processNumber,
      mainProcessId,
      dealId,
      stageId,
      calledByInitialPetitionProvisionalNumber,
    } = job.data;
    this.logger.log(`Inserindo processo #${processNumber}`);
    try {
      await this.insertProcessService.execute({
        processNumber,
        mainProcessId,
        dealId,
        stageId,
        calledByInitialPetitionProvisionalNumber,
      });
    } catch (error) {
      this.logger.error(`Erro ao inserir processo #${processNumber}`, error);
      throw error;
    }
  }
}
