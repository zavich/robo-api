import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
  timestamps: true,
})
class ReasonLoss {
  @Prop()
  key: string;

  @Prop()
  label: string;
}

type ReasonLossDocument = ReasonLoss & Document;
const ReasonLossSchema = SchemaFactory.createForClass(ReasonLoss);
export { ReasonLoss, ReasonLossSchema, ReasonLossDocument };
