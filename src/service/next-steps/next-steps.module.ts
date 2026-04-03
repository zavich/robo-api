import { Module } from '@nestjs/common';
import { NextStepsService } from './next-steps.service';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'process-queue',
      limiter: { max: 2, duration: 1000 },
    }),
  ],
  exports: [NextStepsService],
  providers: [NextStepsService],
})
export class NextStepsModule {}
