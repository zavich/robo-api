import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { Step } from './step.schema';

export enum processStatusName {
  Sucesso = 'Sucesso',
  Rejected = 'Error',
  WatingForLawsuitMain = 'WaitingForLawsuitMain',
}
@Schema({
  timestamps: true,
})
class ProcessStatus {
  @Prop()
  name: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Step.name })
  step: mongoose.Types.ObjectId;

  @Prop()
  log: string;

  @Prop()
  errorReason: string;
}

type ProcessStatusDocument = ProcessStatus & Document;
const ProcessStatusSchema = SchemaFactory.createForClass(ProcessStatus);
export { ProcessStatus, ProcessStatusSchema, ProcessStatusDocument };
