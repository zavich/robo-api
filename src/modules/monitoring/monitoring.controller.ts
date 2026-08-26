import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiKeyAuthGuard } from '../authentication/guards/apikey-auth.guard';
import { CheckPermissions } from '../authentication/decorators/check-permissions.decorator';
import {
  PipelineRangeQuery,
  pipelineRangePipe,
  RANGE_HOURS,
} from './dtos/pipeline-range.dto';
import {
  FetchPipelineMetricsService,
  PipelineSnapshot,
} from './services/fetch-pipeline-metrics.service';

@ApiTags('Monitoring')
@Controller('monitoring')
export class MonitoringController {
  constructor(
    private readonly fetchPipelineMetricsService: FetchPipelineMetricsService,
  ) {}

  // Operação do robô é informação de administração, não de atendimento: fica
  // atrás de `user_management`, a permissão que hoje separa admin de advogado.
  //
  // `SkipThrottle` porque a tela se atualiza sozinha em intervalo curto e o
  // custo da leitura é uma ida ao Redis — sem isso, deixar o monitoramento
  // aberto numa aba consumiria a cota de 100 req/min do IP inteiro.
  @Get('pipeline')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  @CheckPermissions('user_management')
  @SkipThrottle()
  async pipeline(
    @Query(pipelineRangePipe) query: PipelineRangeQuery,
  ): Promise<PipelineSnapshot> {
    return this.fetchPipelineMetricsService.execute(RANGE_HOURS[query.range]);
  }
}
