import { Injectable, NotFoundException } from '@nestjs/common';
import { Observation } from '../schema/observation.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class DeleteObservationService {
  constructor(
    @InjectModel(Observation.name)
    private readonly observationModule: Model<Observation>,
  ) {}

  async execute(id: string): Promise<void> {
    const observation = await this.observationModule.findById(id);

    if (!observation) {
      throw new NotFoundException('Observation not found');
    }
    await this.observationModule.findByIdAndDelete(id);
  }
}
