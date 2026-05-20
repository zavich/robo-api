import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PROCESSSTATUSENUM } from 'src/modules/process/enums/process-status.enum';
import { StatusExtractionInsight } from 'src/modules/process/enums/status-extraction-insight.enum';
import { ProcessStatus } from 'src/modules/process/schema/process-status.schema';
import { Process } from 'src/modules/process/schema/process.schema';
import { Prompt } from 'src/modules/process/schema/prompt.schema';
import { AwsServices } from 'src/service/aws/aws.service';
import { NextStepsService } from 'src/service/next-steps/next-steps.service';
import { VertexAIService } from 'src/service/vertex/vertex-AI.service';
import { normalizeString } from 'src/utils/normalize-string';
import { sleep } from 'src/utils/sleep';

@Injectable()
export class ExtractDocumentsInfoService {
  private readonly logger = new Logger(ExtractDocumentsInfoService.name);

  constructor(
    @InjectModel(Process.name)
    private readonly lawsuitModel: Model<Process>,
    private readonly vertexAIService: VertexAIService,
    private readonly nextStepsService: NextStepsService,
    @InjectModel(Prompt.name)
    private readonly promptModel: Model<Prompt>,
    @InjectModel(ProcessStatus.name)
    private readonly processStatusModule: Model<ProcessStatus>,
    private readonly awsService: AwsServices,
  ) {}
  async execute(lawsuit: string) {
    try {
      const processFound = await this.lawsuitModel.findOne({
        number: lawsuit,
      });
      await this.processStatusModule.findByIdAndUpdate(
        processFound.processStatus,
        {
          name: PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED,
          log: 'Extração de documentos finalizada',
        },
      );

      const documentsToProcess = [];

      const promptPeticaoInicial =
        processFound.class === 'MAIN'
          ? await this.vertexAIService.getPromptProcessoPrincipal()
          : await this.vertexAIService.getPromptExecucaoProvisoria();
      documentsToProcess.push({
        type: /.*peticao.*inicial.*/i,
        prompt: promptPeticaoInicial,
      });

      // Usando for...of para garantir processamento sequencial com sleep
      for (const docInfo of documentsToProcess) {
        await this.extractDocument(
          processFound?.documents,
          lawsuit,
          docInfo.type,
          docInfo.prompt,
        );
        await sleep(5000); // Adiciona um intervalo de 5 segundos entre as chamadas
      }
      this.nextStepsService.execute('step-4', { processNumber: lawsuit });
    } catch (error) {
      console.log('Error ao extrair dados do vertex: ', error);
    }
  }
  async extractDocument(
    documents: any[],
    lawsuit: string,
    type: RegExp,
    prompt: string,
  ) {
    if (!documents) {
      console.log('Nenhum documento encontrado no processo.');
      return;
    }
    // Garantir que apenas o primeiro documento correspondente seja processado
    const document = documents.find((doc) =>
      type.test(normalizeString(doc.title)),
    );

    if (!document) {
      console.log(
        `Nenhum documento do tipo ${type} encontrado para processar.`,
      );
      return;
    }

    console.log(`${type} encontrado: `, document);

    // Marcar documento como PROCESSING
    await this.lawsuitModel.updateOne(
      { number: lawsuit, 'documents._id': document._id },
      { $set: { 'documents.$.status': StatusExtractionInsight.PROCESSING } },
    );
    const gsKey = `${lawsuit}_${document.temp_link}_${Date.now()}`;

    try {
      const signedUrl = await this.awsService.getSignedUrlS3(
        document.temp_link,
      );
      const gsUri = await this.vertexAIService.uploadS3ToGCS(signedUrl, gsKey);
      const response = await this.vertexAIService.executeWithRetry(
        gsUri,
        prompt,
      );

      console.log('Response from Vertex AI: ', response);

      await this.lawsuitModel.updateOne(
        { number: lawsuit, 'documents._id': document._id },
        {
          $set: {
            'documents.$.data': response,
            'documents.$.status': StatusExtractionInsight.COMPLETED,
          },
        },
      );
    } catch (error) {
      await this.lawsuitModel.updateOne(
        { number: lawsuit, 'documents._id': document._id },
        { $set: { 'documents.$.status': StatusExtractionInsight.ERROR } },
      );
      console.log('Error ao extrair dados do vertex: ', error);
      // Propagar o erro para que a fila possa tratá-lo, se necessário
      throw error;
    } finally {
      await this.vertexAIService.deleteFileFromGCS(gsKey);
    }
  }
}
