import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ApiKeyAuthGuard } from '../authentication/guards/apikey-auth.guard';
import { comConcorrenciaLimitada } from 'src/utils/concurrency';
import { FindProcessoService } from './services/find-processo.service';
import { TriggerScrapingService } from './services/trigger-scraping.service';
import { SearchNewLawsuitService } from './services/search-new-lawsuit.service';
import { InsertLawsuitPlaceholderService } from './services/insert-lawsuit-placeholder.service';
import { parseCnj } from './utils/cnj.util';
import {
  SYNC_BATCH_CONCURRENCY,
  SyncBatchSchemaBody,
  syncBatchSchemaPipe,
} from './dtos/sync-batch.dto';

export interface SyncBatchItemResult {
  numeroCnj: string;
  status: 'accepted' | 'invalid' | 'error';
  message?: string;
}

@ApiTags('Lawsuits')
@Controller('lawsuits')
export class LawsuitsController {
  constructor(
    private readonly findProcessoService: FindProcessoService,
    private readonly triggerScrapingService: TriggerScrapingService,
    private readonly searchNewLawsuitService: SearchNewLawsuitService,
    private readonly insertLawsuitPlaceholderService: InsertLawsuitPlaceholderService,
  ) {}

  @Get(':numeroCnj')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async findOne(@Param('numeroCnj') numeroCnj: string, @Res() res: Response) {
    try {
      const userId = res.req.user.id;
      const processo = await this.findProcessoService.execute(
        numeroCnj,
        userId,
      );

      if (!processo) {
        return res.status(404).json({ message: 'Processo não encontrado' });
      }

      return res.json(processo);
    } catch (error: unknown) {
      // Preserva o status/response de exceptions do Nest (ex.:
      // BadRequestException/NotFoundException lançadas pelo service) — sem
      // isso, todo erro virava 500 e mascarava o motivo real pro cliente.
      if (error instanceof HttpException) {
        const status = error.getStatus();
        const response = error.getResponse();
        return res
          .status(status)
          .json(
            typeof response === 'string' ? { message: response } : response,
          );
      }

      return res.status(500).json({
        message: 'Erro interno do servidor',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  @Post(':numeroCnj/sync')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async sync(@Param('numeroCnj') numeroCnj: string, @Req() req: Request) {
    return this.triggerScrapingService.execute(numeroCnj, req.user.id);
  }

  // Mesma extração do `/sync`, só que pra vários CNJs de uma vez. Valida cada
  // CNJ antes de disparar (o `TriggerScrapingService` engole silenciosamente
  // um CNJ inválido em vez de rejeitar, então validamos aqui pra reportar por
  // item). Concorrência limitada porque nem Redis nem o enfileiramento no
  // scraping-robo-api têm proteção própria contra rajada — só o worker de
  // scraping em si é limitado por TRT.
  @Post('sync-batch')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async syncBatch(
    @Body(syncBatchSchemaPipe) body: SyncBatchSchemaBody,
    @Req() req: Request,
  ): Promise<SyncBatchItemResult[]> {
    const userId = req.user.id;

    // Remove duplicatas (preservando a primeira ocorrência) — evita disparar,
    // e custear, a mesma extração duas vezes no mesmo lote por engano.
    const numerosUnicos = Array.from(new Set(body.numerosCnj));

    const invalidos: SyncBatchItemResult[] = [];
    const validos: string[] = [];

    for (const numeroCnj of numerosUnicos) {
      if (parseCnj(numeroCnj)) {
        validos.push(numeroCnj);
      } else {
        invalidos.push({
          numeroCnj,
          status: 'invalid',
          message: 'Número de processo inválido',
        });
      }
    }

    const processados = await comConcorrenciaLimitada(
      validos,
      SYNC_BATCH_CONCURRENCY,
      async (numeroCnj): Promise<SyncBatchItemResult> => {
        try {
          await this.triggerScrapingService.execute(numeroCnj, userId);
          return { numeroCnj, status: 'accepted' };
        } catch (error) {
          return {
            numeroCnj,
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          };
        }
      },
    );

    return [...invalidos, ...processados];
  }

  // Processo ainda não encontrado no Athena — primeira busca, sem documentos
  // restritos (só movimentações), diferente do `/sync` (usado pra
  // re-sincronizar um processo já existente, com documentos).
  @Post(':numeroCnj/search')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async search(@Param('numeroCnj') numeroCnj: string, @Req() req: Request) {
    return this.searchNewLawsuitService.execute(numeroCnj, req.user.id);
  }

  // Só insere o marcador BUSCANDO em comunicacao-spot (de acordo com o TRT e
  // ano do CNJ) — sem disparar extração nenhuma, sem custo de captcha.
  // Nunca sobrescreve um registro já existente.
  @Post(':numeroCnj/insert')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async insert(@Param('numeroCnj') numeroCnj: string) {
    return this.insertLawsuitPlaceholderService.execute(numeroCnj);
  }
}
