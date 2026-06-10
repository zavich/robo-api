import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NextStepsService } from './next-steps.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'insert-process-queue' },
      { name: 'process-validation-queue' },
      { name: 'solvency-validation-queue' },
      { name: 'extract-document-queue' },
      { name: 'initial-petition-queue' },
    ),
  ],
  exports: [NextStepsService],
  providers: [NextStepsService],
})
export class NextStepsModule {}
