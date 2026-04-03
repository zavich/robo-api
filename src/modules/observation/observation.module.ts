import { Module } from '@nestjs/common';

import { MongooseModule } from '@nestjs/mongoose';
import { ObservationController } from './observation.controller';
import { Observation, ObservationSchema } from './schema/observation.schema';
import { CreateObservationService } from './services/create.service';
import { DeleteObservationService } from './services/delete.service';
import { UpdateObservationService } from './services/update.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Observation.name,
        schema: ObservationSchema,
      },
    ]),
  ],
  controllers: [ObservationController],
  providers: [
    CreateObservationService,
    UpdateObservationService,
    DeleteObservationService,
  ],
})
export class ObservationModule {}
