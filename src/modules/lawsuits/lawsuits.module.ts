import { Module } from '@nestjs/common';
import { LawsuitsController } from './lawsuits.controller';
import { AthenaQueryService } from './services/athena-query.service';
import { FindProcessoService } from './services/find-processo.service';

@Module({
  controllers: [LawsuitsController],
  providers: [AthenaQueryService, FindProcessoService],
  exports: [FindProcessoService],
})
export class LawsuitsModule {}
