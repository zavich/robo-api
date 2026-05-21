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
import { ProcessStateMachineService } from '../../../services/process-state-machine.service';

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
    private readonly processStateMachine: ProcessStateMachineService,
  ) {}

  async execute(lawsuit: string) {
    try {
      const processFound = await this.lawsuitModel.findOne({
        number: lawsuit,
      });
      if (!processFound) {
        throw new Error(`Processo ${lawsuit} não encontrado para extração`);
      }

      const promptPeticaoInicial =
        processFound.class === 'MAIN'
          ? await this.vertexAIService.getPromptProcessoPrincipal()
          : await this.vertexAIService.getPromptExecucaoProvisoria();
      const promptPlanilhaCalc = await this.promptModel.findOne({
        type: 'PlanilhaCalculo',
      });

      const resultPeticao = await this.extractDocument(
        processFound.documents,
        lawsuit,
        /.*peticao.*inicial.*/i,
        promptPeticaoInicial,
      );
      const resultPlanilha = await this.extractDocument(
        processFound.documents,
        lawsuit,
        /.*planilha.*de.*calculo.*/i,
        promptPlanilhaCalc?.text ?? '',
      );

      const results = [resultPeticao, resultPlanilha];
      const hasSuccess = results.some((r) => r.status === 'COMPLETED');

      if (!hasSuccess) {
        this.logger.error(
          `Nenhum documento foi extraído com sucesso para ${lawsuit}. Pipeline não avança.`,
        );
        await this.processStateMachine.transition(
          this.processStatusModule,
          processFound.processStatus,
          {
            name: PROCESSSTATUSENUM.ERROR,
            log: 'Nenhum documento foi extraído com sucesso',
            errorReason: 'Falha na extração de documentos via Vertex AI',
          },
        );
        return;
      }

      await this.processStateMachine.transition(
        this.processStatusModule,
        processFound.processStatus,
        {
          name: PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED,
          log: 'Extração de documentos finalizada',
        },
      );

      this.logger.log('START EXTRACT DOCUMENT JOB: ' + lawsuit);
      await this.nextStepsService.execute('step-4', { processNumber: lawsuit });
    } catch (error) {
      this.logger.error('Erro ao extrair dados do vertex: ', error);
      throw error;
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

    const results: boolean[] = [];
    for (const document of documentFound) {
      if (document.data) {
        results.push(true);
        continue;
      }

      await this.lawsuitModel.updateOne(
        { number: lawsuit, 'documents._id': document._id },
        { $set: { 'documents.$.status': StatusExtractionInsight.PROCESSING } },
      );

      const gsKey = `${lawsuit}_${String(document._id)}`;
      let uploadedToGcs = false;

      try {
        const signedUrl = await this.awsService.getSignedUrlS3(
          document.temp_link,
        );
        const gsUri = await this.vertexAIService.uploadS3ToGCS(
          signedUrl,
          gsKey,
        );
        uploadedToGcs = true;
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
        results.push(true);
      } catch (error) {
        await this.lawsuitModel.updateOne(
          { number: lawsuit, 'documents._id': document._id },
          { $set: { 'documents.$.status': StatusExtractionInsight.ERROR } },
        );
        this.logger.error('Erro ao extrair dados do vertex: ', error);
        results.push(false);
      } finally {
        if (uploadedToGcs) {
          await this.vertexAIService.deleteFileFromGCS(gsKey).catch((err) =>
            this.logger.warn(
              `Falha ao deletar ${gsKey} do GCS: ${err?.message ?? err}`,
            ),
          );
        }
      }
    }

    const hasSuccess = results.some((r) => r === true);
    return { status: hasSuccess ? 'COMPLETED' : 'ERROR' };
  }
}
