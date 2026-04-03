import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PROCESSSTATUSENUM } from 'src/modules/process/enums/process-status.enum';
import { StatusExtractionInsight } from 'src/modules/process/enums/status-extraction-insight.enum';
import { ProcessStatus } from 'src/modules/process/schema/process-status.schema';
import { Process } from 'src/modules/process/schema/process.schema';
import { Prompt } from 'src/modules/process/schema/prompt.schema';
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
      await this.extractDocument(
        processFound?.documents,
        lawsuit,
        /.*peticao.*inicial.*/i,
        promptPeticaoInicial,
      );
      await this.extractDocument(
        processFound?.documents,
        lawsuit,
        /.*planilha.*de.*calculo.*/i,
        promptPlanilhaCalc.text,
      );
      this.logger.log('START EXTRACT DOCUMENT JOB: ' + lawsuit);
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
    const documentFound = documents.filter((doc) =>
      type.test(normalizeString(doc.title)),
    );
    console.log(`${type} encontrados: `, documentFound);
    for (const document of documentFound) {
      if (document.data) {
        continue;
      }
      // Marcar documento como PROCESSING
      await this.lawsuitModel.updateOne(
        { number: lawsuit, 'documents._id': document._id },
        { $set: { 'documents.$.status': StatusExtractionInsight.PROCESSING } },
      );

      try {
        const response = await this.vertexAIService.executeWithRetry(
          document.temp_link,
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
      }
      await sleep(3000);
    }
  }
}
