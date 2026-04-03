import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Prompt } from 'src/modules/process/schema/prompt.schema';
import { CreatePromptSchemaBody } from '../dtos/create.dto';

@Injectable()
export class UpdatePromptService {
  constructor(
    @InjectModel(Prompt.name)
    private readonly promptModel: Model<Prompt>,
  ) {}

  async execute(
    id: string,
    updatePromptDto: Partial<CreatePromptSchemaBody>,
  ): Promise<Prompt> {
    try {
      const prompt = await this.promptModel.findById(id);
      if (!prompt) {
        throw new Error('Prompt not found');
      }
      return await this.promptModel.findByIdAndUpdate(id, updatePromptDto, {
        new: true,
      });
    } catch (error) {
      throw error;
    }
  }
}
