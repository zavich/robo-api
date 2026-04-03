import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Step } from 'src/modules/process/schema/step.schema';

@Injectable()
export class ListStepsService {
  constructor(
    @InjectModel(Step.name)
    private readonly stepRepository: Model<Step>,
  ) {}

  async execute() {
    const steps = await this.stepRepository.find();
    return { steps };
  }
}
