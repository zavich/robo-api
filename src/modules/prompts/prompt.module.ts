import { Module } from '@nestjs/common';
import { PromptController } from './prompt.controller';
import { ListPromptService } from './services/list-prompt.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Prompt, PromptSchema } from '../process/schema/prompt.schema';
import { CreatePromptService } from './services/create.service';
import { UpdatePromptService } from './services/update.service';
import { DeletePromptService } from './services/delete.service';
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Prompt.name,
        schema: PromptSchema,
      },
    ]),
  ],
  controllers: [PromptController],
  providers: [
    ListPromptService,
    CreatePromptService,
    UpdatePromptService,
    DeletePromptService,
  ],
  exports: [],
})
export class PromptModule {}
