import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../user/schema/user.schema';

@Schema({
  timestamps: true,
})
export class ProcessOwner {
  @Prop({ type: Types.ObjectId, ref: 'Process', required: true })
  processId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  userId: Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;
}

export type ProcessOwnerDocument = ProcessOwner & Document;
export const ProcessOwnerSchema = SchemaFactory.createForClass(ProcessOwner);