import { Module } from '@nestjs/common';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { LawsuitsController } from './lawsuits.controller';
import { AthenaQueryService } from './services/athena-query.service';
import { FindProcessoService } from './services/find-processo.service';
import { TriggerScrapingService } from './services/trigger-scraping.service';
import { ParquetWriterService } from './services/parquet-writer.service';
import { SaveWebhookToAthenaService } from './services/save-webhook-to-athena.service';
import { SaveWebhookToComunicacaoSpotService } from './services/save-webhook-to-comunicacao-spot.service';
import { CacheProcessoToRedisService } from './services/cache-processo-to-redis.service';
import { SearchNewLawsuitService } from './services/search-new-lawsuit.service';
import { InsertLawsuitPlaceholderService } from './services/insert-lawsuit-placeholder.service';
import { FetchComunicacaoSpotService } from './services/fetch-comunicacao-spot.service';

@Module({
  imports: [MonitoringModule],
  controllers: [LawsuitsController],
  providers: [
    AthenaQueryService,
    FindProcessoService,
    TriggerScrapingService,
    ParquetWriterService,
    SaveWebhookToAthenaService,
    SaveWebhookToComunicacaoSpotService,
    CacheProcessoToRedisService,
    SearchNewLawsuitService,
    InsertLawsuitPlaceholderService,
    FetchComunicacaoSpotService,
  ],
  exports: [
    FindProcessoService,
    SaveWebhookToAthenaService,
    SaveWebhookToComunicacaoSpotService,
    CacheProcessoToRedisService,
  ],
})
export class LawsuitsModule {}
