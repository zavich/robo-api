import { Injectable, NotFoundException } from '@nestjs/common';
import { Observation, ObservationDocument } from '../schema/observation.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class UpdateObservationService {
  constructor(
    @InjectModel(Observation.name)
    private readonly observationModel: Model<Observation>,
  ) {}

  async excute(
    id: string,
    description: ObservationDocument,
  ): Promise<Observation> {
    const observation = await this.observationModel.findByIdAndUpdate({
      where: { id },
      data: { description },
    });
    if (!observation) {
      throw new NotFoundException(`Observation with id ${id} not found`);
    }
    return observation.save();
  }
}
