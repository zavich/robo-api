import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Step } from '../schema/step.schema';
import { Model } from 'mongoose';

@Injectable()
export class StepService {
  constructor(
    @InjectModel(Step.name)
    private readonly stepModule: Model<Step>,
  ) {}
  async execute() {
    try {
      const steps = await this.stepModule.insertMany([
        {
          name: 'Step 1',
          slug: 'step-1',
          next: 'step-2',
          previous: null,
        },
        {
          name: 'Step 2',
          slug: 'step-2',
          next: 'step-3',
          previous: 'step-1',
        },
        {
          name: 'Step 3',
          slug: 'step-3',
          next: 'step-4',
          previous: 'step-2',
        },
      ]);
      return steps;
    } catch (error) {
      console.log(error);
      return error;
    }
  }
}
