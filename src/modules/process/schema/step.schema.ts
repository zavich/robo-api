import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
  timestamps: true,
})
class Step {
  @Prop()
  name: string;

  @Prop()
  slug: string;

  @Prop()
  next: string;

  @Prop()
  previous: string;
}

type StepDocument = Step & Document;
const StepSchema = SchemaFactory.createForClass(Step);
export { Step, StepSchema, StepDocument };
