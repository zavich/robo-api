import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { PROCESSSTATUSENUM } from '../enums/process-status.enum';
import { Step } from './step.schema';

/** @deprecated Use PROCESSSTATUSENUM instead */
export const processStatusName = {
  Sucesso: PROCESSSTATUSENUM.SUCCESS,
  Rejected: PROCESSSTATUSENUM.ERROR,
  WatingForLawsuitMain: PROCESSSTATUSENUM.WAITING_FOR_LAWSUIT_MAIN,
} as const;

@Schema({
  timestamps: true,
})
class ProcessStatus {
  @Prop({ enum: Object.values(PROCESSSTATUSENUM) })
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
