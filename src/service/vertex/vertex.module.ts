import { Module } from '@nestjs/common';
import { VertexAIService } from './vertex-AI.service';
import { ConfigModule } from '@nestjs/config';
import { AwsAppModule } from '../aws/aws.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Prompt, PromptSchema } from 'src/modules/process/schema/prompt.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Prompt.name,
        schema: PromptSchema,
      },
    ]),
    ConfigModule,
    AwsAppModule,
  ],
  providers: [VertexAIService],
  exports: [VertexAIService],
})
export class VertexModule {}
