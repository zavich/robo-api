import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Prompt } from 'src/modules/process/schema/prompt.schema';

@Injectable()
export class DeletePromptService {
  constructor(
    @InjectModel(Prompt.name)
    private readonly promptModel: Model<Prompt>,
  ) {}

  async execute(id: string) {
    try {
      await this.promptModel.findByIdAndDelete(id);
      return { message: 'Prompt deleted successfully' };
    } catch (error) {
      throw error;
    }
  }
}
