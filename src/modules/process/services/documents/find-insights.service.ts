import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VertexAIService } from 'src/service/vertex/vertex-AI.service';
import { Process } from '../../schema/process.schema';
import { Prompt } from '../../schema/prompt.schema';
import { StatusExtractionInsight } from '../../enums/status-extraction-insight.enum';
import { AwsServices } from 'src/service/aws/aws.service';

@Injectable()
export class FindInsightsService {
  private readonly logger = new Logger(FindInsightsService.name);

  constructor(
    @InjectModel(Process.name)
    private readonly lawsuitModel: Model<Process>,
    private readonly vertexAIService: VertexAIService,
    @InjectModel(Prompt.name)
    private readonly promptModule: Model<Prompt>,
    private readonly awsService: AwsServices,
  ) {}
  async execute(number: string, documents: string[], promptId: string) {
    try {
      const lawsuit = await this.lawsuitModel.findOne({ number });
      if (!lawsuit) {
        throw new Error('Lawsuit not found');
      }
      const documentsLawsuit = lawsuit.documents.filter((doc) =>
        documents.includes(String(doc._id)),
      );
      const processParts = lawsuit.processParts || [];
      const context = {
        poloAtivo: {
          partes: processParts
            .filter((p) => p.polo === 'ATIVO' && p.tipo === 'REQUERENTE')
            .map((p) => p.nome),
          advogados: processParts
            .filter((p) => p.polo === 'ATIVO' && p.tipo === 'ADVOGADO')
            .map((p) => p.nome),
        },
        poloPassivo: {
          partes: processParts
            .filter((p) => p.polo === 'PASSIVO' && p.tipo === 'REQUERIDO')
            .map((p) => p.nome),
          advogados: processParts
            .filter((p) => p.polo === 'PASSIVO' && p.tipo === 'ADVOGADO')
            .map((p) => p.nome),
        },
        peritos: processParts
          .filter((p) => p.tipo?.toUpperCase().includes('PERITO'))
          .map((p) => p.nome),
      };
      const promptFind = await this.promptModule.findById(promptId);
      const contextText = `
          Contexto do processo (usar apenas para identificar quem assinou/juntou o documento):

          ${JSON.stringify(context, null, 2)}

          Regras adicionais:
          Compare o nome extraído do rodapé (owner) com as listas acima.
          Se estiver em poloAtivo → "reclamante"
          Se estiver em poloPassivo → "reclamada"
          Se estiver em peritos → "perito"
          Se não corresponder → null.
          Priorize a última assinatura do documento.
          `;

      await Promise.all(
        documentsLawsuit.map(async (doc) => {
          await this.lawsuitModel.findOneAndUpdate(
            {
              number: number,
              'documents._id': doc._id,
            },
            {
              $set: {
                'documents.$.status': StatusExtractionInsight.PROCESSING,
              },
            },
          );
          const fullPrompt =
            promptFind.type === 'PlanilhaCalculo'
              ? `${promptFind.text}\n\n${contextText}`
              : promptFind.text;

          const gsKey = `${number}_${doc.temp_link}_${Date.now()}`;
          try {
            const signedUrl = await this.awsService.getSignedUrlS3(
              doc.temp_link,
            );
            const gsUri = await this.vertexAIService.uploadS3ToGCS(
              signedUrl,
              gsKey,
            );
            const response = await this.vertexAIService.executeWithRetry(
              gsUri,
              fullPrompt,
            );
            this.logger.log(`response: ${JSON.stringify(response)}`);

            doc.data = response;
            await this.lawsuitModel.findOneAndUpdate(
              {
                number: number,
                'documents._id': doc._id,
              },
              {
                $set: {
                  'documents.$.data': response,
                  'documents.$.status': StatusExtractionInsight.COMPLETED,
                },
              },
              { new: true },
            );
          } catch (error) {
            await this.lawsuitModel.findOneAndUpdate(
              {
                number: number,
                'documents._id': doc._id,
              },
              {
                $set: {
                  'documents.$.status': StatusExtractionInsight.ERROR,
                },
              },
            );
            this.logger.error(`Erro ao extrair insight do documento: ${error instanceof Error ? error.stack : String(error)}`);
          } finally {
            await this.vertexAIService.deleteFileFromGCS(gsKey);
          }
        }),
      );
      return { documentsLawsuit, promptFind };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error executing document insights');
    }
  }
}
