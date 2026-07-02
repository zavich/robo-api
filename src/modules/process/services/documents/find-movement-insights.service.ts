import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VertexAIService } from 'src/service/vertex/vertex-AI.service';
import { Prompt } from '../../schema/prompt.schema';

@Injectable()
export class FindMovementInsightsService {
  private readonly logger = new Logger(FindMovementInsightsService.name);

  constructor(
    private readonly vertexAIService: VertexAIService,
    @InjectModel(Prompt.name)
    private readonly promptModule: Model<Prompt>,
  ) {}

  async execute(texto: string, promptId: string) {
    const promptFind = await this.promptModule.findById(promptId);
    if (!promptFind) {
      this.logger.warn(`Prompt não encontrado (promptId=${promptId})`);
      throw new BadRequestException('Prompt not found');
    }

    this.logger.log(
      `Extraindo insight de movimentação — prompt="${promptFind.type}", texto com ${texto.length} caracteres`,
    );

    try {
      const data = await this.vertexAIService.executeTextWithRetry(
        texto,
        promptFind.text,
      );

      this.logger.log(
        `Insight de movimentação extraído com sucesso — prompt="${promptFind.type}"`,
      );

      return { data };
    } catch (error) {
      this.logger.error(
        `Falha ao extrair insight de movimentação — prompt="${promptFind.type}": ${error instanceof Error ? error.stack : String(error)}`,
      );
      throw error;
    }
  }
}
