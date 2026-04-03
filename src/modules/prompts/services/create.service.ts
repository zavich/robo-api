import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Prompt } from 'src/modules/process/schema/prompt.schema';
import { CreatePromptSchemaBody } from '../dtos/create.dto';

@Injectable()
export class CreatePromptService {
  constructor(
    @InjectModel(Prompt.name)
    private readonly promptModel: Model<Prompt>,
  ) {}

  async execute(data: CreatePromptSchemaBody): Promise<Prompt> {
    try {
      const prompt = await this.promptModel.create(data);
      return prompt;
    } catch (error) {
      throw error;
    }
  }
}
