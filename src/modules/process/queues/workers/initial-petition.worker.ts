import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InitialPetitionService } from '../process/services/initial-petition.service';

interface InitialPetitionJobData {
  processNumber?: string;
  resposta?: { numero_unico: string };
}

@Processor('initial-petition-queue')
export class InitialPetitionWorker extends WorkerHost {
  private readonly logger = new Logger(InitialPetitionWorker.name);

  constructor(
    private readonly initialPetitionService: InitialPetitionService,
  ) {
    super();
  }

  async process(job: Job<InitialPetitionJobData>): Promise<void> {
    const { processNumber, resposta } = job.data;
    const number = processNumber || resposta?.numero_unico;
    if (!number) {
      throw new Error('Número do processo ausente no payload do job (initial-petition)');
    }
    this.logger.log(`Processando petição inicial do processo #${number}`);
    try {
      await this.initialPetitionService.execute(number);
    } catch (error) {
      this.logger.error(`Erro na petição inicial do processo #${number}`, error);
      throw error;
    }
  }
}
