import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { User } from 'src/modules/user/schema/user.schema';
import { STAGEPROCESS } from '../interfaces/enum';
import { Situation } from './process.schema';

@Schema({ _id: false, timestamps: true }) // subdocumento não precisa de _id se não quiser
class History {
  @Prop({
    enum: Situation,
    required: true,
    default: Situation.PENDING,
  })
  status: Situation;

  @Prop({
    enum: STAGEPROCESS,
    required: true,
    default: STAGEPROCESS.PRE_ANALISE,
  })
  stage: STAGEPROCESS;

  @Prop()
  rejection_reason?: string;

  @Prop()
  stage_id?: number;

  @Prop([String])
  custom_rejection_description?: string[];

  @Prop()
  is_custom_reason?: boolean;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: User.name })
  user_id: mongoose.Types.ObjectId;

  @Prop()
  updatedAt?: Date;

  @Prop()
  createdAt?: Date;
}
const HistorySchema = SchemaFactory.createForClass(History);
@Schema({
  timestamps: true,
})
class ProcessDecisions {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: User.name })
  process_id: mongoose.Types.ObjectId;
  // 👉 histórico como subdocumento
  @Prop({ type: [HistorySchema], default: [] })
  history: History[];
}

type ProcessDecisionsDocument = ProcessDecisions & Document;
const ProcessDecisionsSchema = SchemaFactory.createForClass(ProcessDecisions);

export { ProcessDecisions, ProcessDecisionsSchema, ProcessDecisionsDocument };
