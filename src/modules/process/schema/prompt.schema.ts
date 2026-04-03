import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
  timestamps: true,
})
class Prompt {
  @Prop({ type: String, required: true })
  type: string;

  @Prop()
  text: string;
}

type PromptDocument = Prompt & Document;
const PromptSchema = SchemaFactory.createForClass(Prompt);
export { Prompt, PromptSchema, PromptDocument };
