import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { Observation, ObservationDocument } from '../schema/observation.schema';

@Injectable()
export class CreateObservationService {
  constructor(
    @InjectModel(Observation.name)
    private readonly observationModule: Model<Observation>,
  ) {}

  async execute(createObservationDto: ObservationDocument) {
    const existingObservation = await this.observationModule.findOne({
      processId: new mongoose.Types.ObjectId(createObservationDto.processId),
    });
    if (existingObservation) {
      return await this.observationModule.findByIdAndUpdate(
        existingObservation.id,
        { description: createObservationDto.description },
        { new: true },
      );
    }
    return await this.observationModule.create(createObservationDto);
  }
}
