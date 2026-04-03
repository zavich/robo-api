import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { Process as ProcessEntity } from './process.schema';
import { Company } from './company.schema';

@Schema({
  timestamps: true,
})
class ClaimedProcesses {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Company.name })
  companyId: mongoose.Types.ObjectId | Company;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: ProcessEntity.name })
  processId: mongoose.Types.ObjectId;

  // @Prop()
  // responsibility?: any;
}

type ClaimedProcessesDocument = ClaimedProcesses & Document;
const ClaimedProcessesSchema = SchemaFactory.createForClass(ClaimedProcesses);

export { ClaimedProcesses, ClaimedProcessesSchema, ClaimedProcessesDocument };
