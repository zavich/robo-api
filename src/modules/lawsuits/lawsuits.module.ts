import { Module } from '@nestjs/common';
import { LawsuitsController } from './lawsuits.controller';
import { AthenaQueryService } from './services/athena-query.service';
import { FindProcessoService } from './services/find-processo.service';
import { TriggerScrapingService } from './services/trigger-scraping.service';
import { ParquetWriterService } from './services/parquet-writer.service';
import { SaveWebhookToAthenaService } from './services/save-webhook-to-athena.service';

@Module({
  controllers: [LawsuitsController],
  providers: [
    AthenaQueryService,
    FindProcessoService,
    TriggerScrapingService,
    ParquetWriterService,
    SaveWebhookToAthenaService,
  ],
  exports: [FindProcessoService, SaveWebhookToAthenaService],
})
export class LawsuitsModule {}
