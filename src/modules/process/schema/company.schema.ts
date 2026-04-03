import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { Process as ProcessEntity } from './process.schema';

enum SpecialRule {
  whitelist = 'solvente',
  blacklist = 'insolvente',
}

@Schema({
  timestamps: true,
})
class Company {
  @Prop()
  name: string;

  //ACREDITO QUE NÃO É NECESSÁRIO ESSA PROPRIEDADE POIS PODE HAVER VARIOS PROCESSOS RELACIONADOS A UMA EMPRESA
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: ProcessEntity.name })
  process: mongoose.Schema.Types.ObjectId;

  @Prop()
  cnpj: string;

  @Prop()
  socialReason: string;

  @Prop()
  fantasyName: string;

  @Prop()
  email: string;

  @Prop()
  registrationStatus: string;

  @Prop()
  legalNature: string;

  @Prop()
  taxRegime: string;

  //caso o fluxo de validação de solvencia da empresa esteja OK, é whitelist, caso contrário é blacklist
  @Prop({ enum: SpecialRule, default: null })
  specialRule: SpecialRule;

  @Prop()
  integrationId: string;

  @Prop()
  isSolvent: boolean;

  @Prop()
  errorReason: string;

  @Prop()
  partners: Array<any>;

  @Prop()
  socialCapital: string;

  @Prop()
  reason: string;

  @Prop()
  invoicing: string;

  @Prop()
  porte: string;

  @Prop({ type: mongoose.Schema.Types.Mixed })
  cndt: any;

  @Prop()
  score: number;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

type CompanyDocument = Company & Document;

const CompanySchema = SchemaFactory.createForClass(Company);

export { Company, CompanySchema, CompanyDocument, SpecialRule };
