import {
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiKeyAuthGuard } from '../authentication/guards/apikey-auth.guard';
import { FindProcessoService } from './services/find-processo.service';
import { TriggerScrapingService } from './services/trigger-scraping.service';
import { SearchNewLawsuitService } from './services/search-new-lawsuit.service';
import { InsertLawsuitPlaceholderService } from './services/insert-lawsuit-placeholder.service';

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
      const processo = await this.findProcessoService.execute(numeroCnj);

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
          .json(typeof response === 'string' ? { message: response } : response);
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
  async sync(@Param('numeroCnj') numeroCnj: string) {
    return this.triggerScrapingService.execute(numeroCnj);
  }

  // Processo ainda não encontrado no Athena — primeira busca, sem documentos
  // restritos (só movimentações), diferente do `/sync` (usado pra
  // re-sincronizar um processo já existente, com documentos).
  @Post(':numeroCnj/search')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async search(@Param('numeroCnj') numeroCnj: string) {
    return this.searchNewLawsuitService.execute(numeroCnj);
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
