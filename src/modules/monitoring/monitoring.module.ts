import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { FetchPipelineMetricsService } from './services/fetch-pipeline-metrics.service';
import { RecordPipelineEventService } from './services/record-pipeline-event.service';

// `RecordPipelineEventService` é exportado porque quem produz os eventos são
// outros módulos: lawsuits (disparo da extração) e process (chegada do
// webhook). O módulo não importa nenhum deles — a dependência anda só num
// sentido, o que evita ciclo entre process e lawsuits passando por aqui.
@Module({
  controllers: [MonitoringController],
  providers: [RecordPipelineEventService, FetchPipelineMetricsService],
  exports: [RecordPipelineEventService],
})
export class MonitoringModule {}
