import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReasonLoss, ReasonLossSchema } from './schema/reason-refusal.schema';
import { ReasonLossController } from './reason-refusal.controller';
import { CreateReasonLossService } from './services/create.service';
import { ListReasonLossService } from './services/list.service';
import { DeleteReasonLossService } from './services/delete.service';
import { UpdateReasonLossService } from './services/update.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ReasonLoss.name,
        schema: ReasonLossSchema,
      },
    ]),
  ],
  controllers: [ReasonLossController],
  providers: [
    CreateReasonLossService,
    ListReasonLossService,
    DeleteReasonLossService,
    UpdateReasonLossService,
  ],
  exports: [],
})
export class ReasonLossModule {}
