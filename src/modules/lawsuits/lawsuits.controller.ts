import { Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiKeyAuthGuard } from '../authentication/guards/apikey-auth.guard';
import { FindProcessoService } from './services/find-processo.service';
import { TriggerScrapingService } from './services/trigger-scraping.service';

@ApiTags('Lawsuits')
@Controller('lawsuits')
export class LawsuitsController {
  constructor(
    private readonly findProcessoService: FindProcessoService,
    private readonly triggerScrapingService: TriggerScrapingService,
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
    } catch (error) {
      return res.status(500).json({
        message: 'Erro interno do servidor',
        error: error.message,
      });
    }
  }

  @Post(':numeroCnj/sync')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async sync(@Param('numeroCnj') numeroCnj: string) {
    return this.triggerScrapingService.execute(numeroCnj);
  }
}
