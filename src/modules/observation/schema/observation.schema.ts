import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';
import { Process as ProcessEntity } from '../../process/schema/process.schema';

export type ObservationDocument = Observation & Document;

@Schema({ timestamps: true })
export class Observation {
  @Prop({ required: true })
  description: string;
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: ProcessEntity.name })
  processId: mongoose.Types.ObjectId;
}

export const ObservationSchema = SchemaFactory.createForClass(Observation);
