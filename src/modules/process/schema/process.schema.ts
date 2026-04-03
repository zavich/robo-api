import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Types } from 'mongoose';
import { StatusExtractionInsight } from '../enums/status-extraction-insight.enum';
import { ActivityStatus, STAGEPROCESS, TypeActivity } from '../interfaces/enum';

import { Complainant } from './complainant.schema';
import { ProcessStatus } from './process-status.schema';

enum Situation {
  PENDING = 'PENDING',
  LOSS = 'LOSS',
  APPROVED = 'APPROVED',
}

enum ProcessDocumentType {
  HomologacaoDeCalculo = 'HomologacaoDeCalculo',
  PeticaoInicial = 'PeticaoInicial',
  AdmissibilidadeRR = 'AdmissibilidadeRR',
  HomologacaoDeAcordo = 'HomologacaoDeAcordo',
  RRReclamada = 'RRReclamada',
  RecursoDeRevista = 'RecursoDeRevista',
  SentencaMerito = 'SentencaMerito',
  SentencaED = 'SentencaED',
  SentencaEE = 'SentencaEE',
  Acordao = 'Acordao',
  AcordaoMerito = 'AcordaoMerito',
  AcordaoED = 'AcordaoED',
  AcordaoAP = 'AcordaoAP',
  AcordaoTRT = 'AcordaoTRT',
  RRAP = 'RRAP',
  EmendaAInicial = 'EmendaAInicial',
  Alvara = 'Alvara',
  PlanilhaCalculo = 'PlanilhaCalculo',
  Parcelamento916 = 'Parcelamento916',
  Impugnacao = 'Impugnacao',
  Garantia = 'Garantia',
  Decisao = 'DecisaoPrevencao', //OK
}

const AutosDataSchema = new mongoose.Schema(
  {
    // turma
    class: { type: String, required: true },
    // relator
    relator: { type: String, required: true },
    // status
    status: { type: String, required: false },
    // nomeEmbargante
    ativo: { type: String, required: true },
    // nomeEmbargado
    passivo: { type: String, required: true },
    // dataTransitou
    dateOfTransit: { type: String, required: true },
    // dataDistribuicão
    dateOfDistribution: { type: String, required: true },
    // movimentacoes
    movements: { type: Array, required: true },
  },
  { _id: false },
);

export const RestrictedDocumentSchema = new mongoose.Schema({
  type: { type: String, required: true },
  title: { type: String, required: true },
  extension: { type: String, required: true },
  data: { type: Object, required: true },
  temp_link: { type: String, required: true },
  uniqueName: { type: String },
  date: { type: String },
  instancia: { type: String },
  status: {
    type: String,
    enum: Object.values(StatusExtractionInsight),
    default: StatusExtractionInsight.PENDING,
    required: false,
  },
});
const ProcessPartsSchema = new mongoose.Schema({
  id: { type: Number },
  nome: { type: String },
  tipo: { type: String },
  polo: { type: String },
  principal: { type: Boolean },
  documento: { type: Object },
});
export interface RestrictedDocument extends Document {
  _id: Types.ObjectId;
  type: string;
  title: string;
  extension: string;
  data: any;
  temp_link: string;
  uniqueName?: string;
  date?: string;
  instancia?: string;
  status?: StatusExtractionInsight;
}
export interface ProcessPartsDTO extends Document {
  nome: string;
  tipo: string;
  polo: string;
  principal: boolean;
  documento: any;
}
const ActivityDocumentSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, enum: TypeActivity },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isCompleted: { type: Boolean, required: true, default: false },
    completedAt: { type: Date, required: false, default: null },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now },
    notes: { type: String, required: false, default: null },
    status: {
      type: String,
      required: true,
      enum: Object.values(ActivityStatus),
    },
    lossReason: { type: String, required: false },
  },
  { _id: false },
);
export interface ActivityDocument {
  type: TypeActivity;
  assignedTo: Types.ObjectId;
  assignedBy: Types.ObjectId;
  completedBy: Types.ObjectId;
  isCompleted: boolean;
  completedAt: Date | null;
  notes?: string;
  status: ActivityStatus;
  lossReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Schema({
  timestamps: true,
})
class Process {
  @Prop({ type: [String], default: [] })
  unreadByUsers: string[];

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: ProcessStatus.name })
  processStatus: mongoose.Types.ObjectId;

  @Prop()
  number: string;

  @Prop()
  title: string;

  //OPE = QUANDO PROCESSO ESTIVER INICIANDO O PROCESSO DE ANÁLISE
  // ISSUE= DE ALGUM ERROR NO PROCESSO
  // FINISHED = PROCESSO ESTIVER PASSADO PELA A ESTEIRA DE VALIDAÇÃO
  // ARCHIVED
  @Prop({ enum: Situation })
  situation: Situation;

  @Prop()
  sentToRecords: string;

  @Prop()
  registrationStatus: string;

  @Prop()
  legalNature: string;

  @Prop()
  taxRegime: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Complainant.name })
  complainant: mongoose.Types.ObjectId;

  @Prop({ type: AutosDataSchema })
  autosData: typeof AutosDataSchema;

  @Prop()
  moviments: Array<any>;

  @Prop()
  class: string;

  @Prop()
  arquived: boolean;

  @Prop()
  valueCase: number;

  @Prop({ type: [RestrictedDocumentSchema], default: [] })
  documents: RestrictedDocument[];

  @Prop({
    required: false,
    type: mongoose.Schema.Types.ObjectId,
    ref: Process.name,
  })
  processMain: mongoose.Types.ObjectId;

  @Prop({
    required: false,
  })
  processNumberMain: string;

  @Prop({ type: [ProcessPartsSchema], default: [] })
  processParts: ProcessPartsDTO[];

  @Prop()
  origem: string;

  @Prop()
  instanciasAutos: Array<any>;

  @Prop()
  instancias: Array<any>;

  /**
   * Valor do Credito definido em liberacoes
   **/
  @Prop()
  creditValue: number;

  /**
   * Processo transitado em julgado
   **/
  @Prop()
  resJudicata: boolean;

  @Prop()
  dealId: number;

  @Prop()
  noteId: number;

  @Prop()
  calledByProvisionalLawsuitNumber: string;

  @Prop({ enum: STAGEPROCESS, default: STAGEPROCESS.PRE_ANALISE })
  stage: STAGEPROCESS;

  @Prop()
  stageId: number;

  @Prop()
  synchronizedAt: Date;

  @Prop({ type: mongoose.Schema.Types.Mixed })
  oldMoviments: any;

  @Prop({ type: mongoose.Schema.Types.Mixed })
  formPipedrive: any;

  @Prop({ type: [ActivityDocumentSchema], default: [] })
  activities: ActivityDocument[];
}

type ProcessDocument = Process & Document;
const ProcessSchema = SchemaFactory.createForClass(Process);
export {
  Process,
  ProcessDocument,
  ProcessDocumentType,
  ProcessSchema,
  Situation,
};
