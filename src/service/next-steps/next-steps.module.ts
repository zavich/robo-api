import { Module } from '@nestjs/common';
import { NextStepsService } from './next-steps.service';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'process-queue',
    }),
  ],
  exports: [NextStepsService],
  providers: [NextStepsService],
})
export class NextStepsModule {}
