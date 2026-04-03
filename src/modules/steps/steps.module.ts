import { Module } from '@nestjs/common';
import { StepsController } from './steps.controller';
import { ListStepsService } from './services/list.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Step, StepSchema } from '../process/schema/step.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Step.name,
        schema: StepSchema,
      },
    ]),
  ],
  controllers: [StepsController],
  providers: [ListStepsService],
})
export class StepsModule {}
