import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model } from 'mongoose';
import { LawsuitNumber, Root } from '../../interfaces/process.interface';
import { Process as ProcessSchema } from '../../schema/process.schema';
import { ExtractDocumentsInfoService } from '../process/services/extract-documents-info.service';

@Processor('extract-document-queue', {
  concurrency: 2,
})
export class ExtractDocumentWorker extends WorkerHost {
  private readonly logger = new Logger(ExtractDocumentWorker.name);

  constructor(
    @InjectModel(ProcessSchema.name)
    private readonly processModule: Model<ProcessSchema>,
    private readonly extractDocumentsInfoService: ExtractDocumentsInfoService,
  ) {
    super();
  }

  async process(job: Job<Root | LawsuitNumber>): Promise<void> {
    const body = job.data;
    this.logger.log('Iniciando extração de documentos');
    try {
      const processNumber =
        'resposta' in body ? body?.resposta?.numero_unico : body?.processNumber;
      if (!processNumber) {
        throw new Error('Número do processo ausente no payload do job');
      }
      const processFound = await this.processModule
        .findOne({ number: processNumber })
        .populate(['processStatus']);
      if (!processFound) {
        throw new Error(`Processo não encontrado: ${processNumber}`);
      }
      await this.extractDocumentsInfoService.execute(processFound.number);
      this.logger.log('Extração de documentos concluída');
    } catch (error) {
      this.logger.error('Erro na extração de documentos', error);
      throw error;
    }
  }
}
