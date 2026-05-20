import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PROCESSSTATUSENUM } from 'src/modules/process/enums/process-status.enum';
import { StatusExtractionInsight } from 'src/modules/process/enums/status-extraction-insight.enum';
import { ProcessStatus } from 'src/modules/process/schema/process-status.schema';
import { Process, RestrictedDocument } from 'src/modules/process/schema/process.schema';
import { Prompt } from 'src/modules/process/schema/prompt.schema';
import { AwsServices } from 'src/service/aws/aws.service';
import { NextStepsService } from 'src/service/next-steps/next-steps.service';
import { VertexAIService } from 'src/service/vertex/vertex-AI.service';
import { normalizeString } from 'src/utils/normalize-string';

interface ExtractionResult {
  status: 'COMPLETED' | 'ERROR' | 'SKIPPED';
}

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

      const promptPeticaoInicial =
        processFound.class === 'MAIN'
          ? await this.vertexAIService.getPromptProcessoPrincipal()
          : await this.vertexAIService.getPromptExecucaoProvisoria();
      const promptPlanilhaCalc = await this.promptModel.findOne({
        type: 'PlanilhaCalculo',
      });

      const [resultPeticao, resultPlanilha] = await Promise.all([
        this.extractDocument(
          processFound?.documents,
          lawsuit,
          /.*peticao.*inicial.*/i,
          promptPeticaoInicial,
        ),
        this.extractDocument(
          processFound?.documents,
          lawsuit,
          /.*planilha.*de.*calculo.*/i,
          promptPlanilhaCalc?.text ?? '',
        ),
      ]);

      const results = [resultPeticao, resultPlanilha];
      const allFailed = results.every((r) => r.status === 'ERROR');

      if (allFailed) {
        this.logger.error(
          `Todos os documentos falharam na extração para ${lawsuit}. Pipeline não avança.`,
        );
        await this.processStatusModule.findByIdAndUpdate(
          processFound.processStatus,
          {
            name: PROCESSSTATUSENUM.ERROR,
            log: 'Todos os documentos falharam na extração',
            errorReason: 'Falha na extração de documentos via Vertex AI',
          },
        );
        return;
      }

      this.logger.log('START EXTRACT DOCUMENT JOB: ' + lawsuit);
      await this.nextStepsService.execute('step-4', { processNumber: lawsuit });
    } catch (error) {
      this.logger.error('Erro ao extrair dados do vertex: ', error);
    }
  }

  async extractDocument(
    documents: RestrictedDocument[],
    lawsuit: string,
    type: RegExp,
    prompt: string,
  ): Promise<ExtractionResult> {
    if (!documents) {
      this.logger.log('Nenhum documento encontrado no processo.');
      return { status: 'SKIPPED' };
    }

    const documentFound = documents.filter((doc) =>
      type.test(normalizeString(doc.title)),
    );
    this.logger.log(`${type} encontrados: ${documentFound.length}`);

    if (documentFound.length === 0) {
      return { status: 'SKIPPED' };
    }

    const results = await Promise.all(
      documentFound.map(async (document) => {
        if (document.data) {
          return true;
        }

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
          const gsUri = await this.vertexAIService.uploadS3ToGCS(
            signedUrl,
            gsKey,
          );
          const response = await this.vertexAIService.executeWithRetry(
            gsUri,
            prompt,
          );

          await this.lawsuitModel.updateOne(
            { number: lawsuit, 'documents._id': document._id },
            {
              $set: {
                'documents.$.data': response,
                'documents.$.status': StatusExtractionInsight.COMPLETED,
              },
            },
          );
          return true;
        } catch (error) {
          await this.lawsuitModel.updateOne(
            { number: lawsuit, 'documents._id': document._id },
            { $set: { 'documents.$.status': StatusExtractionInsight.ERROR } },
          );
          this.logger.error('Erro ao extrair dados do vertex: ', error);
          return false;
        } finally {
          await this.vertexAIService.deleteFileFromGCS(gsKey).catch((err) =>
            this.logger.warn(
              `Falha ao deletar ${gsKey} do GCS: ${err?.message ?? err}`,
            ),
          );
        }
      }),
    );

    const hasSuccess = results.some((r) => r === true);
    return { status: hasSuccess ? 'COMPLETED' : 'ERROR' };
  }
}
