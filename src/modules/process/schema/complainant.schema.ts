import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
  timestamps: true,
})
class Complainant {
  @Prop()
  name: string;

  @Prop()
  cpf: string;

  @Prop()
  email: string[];

  @Prop()
  phones: string[];

  @Prop()
  cep: string;
}

type ComplainantDocument = Complainant & Document;
const ComplainantSchema = SchemaFactory.createForClass(Complainant);

export { Complainant, ComplainantSchema, ComplainantDocument };
