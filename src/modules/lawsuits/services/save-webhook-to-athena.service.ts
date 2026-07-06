import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import type { SchemaDefinition } from '@dsnp/parquetjs';
import {
  Instancia,
  Root,
} from 'src/modules/process/interfaces/process.interface';
import { parseCnj } from '../utils/cnj.util';
import { ParquetWriterService } from './parquet-writer.service';

// Schemas espelhando exatamente o `SHOW CREATE TABLE` das 4 tabelas no Glue
// (pje_enriquecimento). `trt`/`ano_processo` não entram aqui — são colunas de
// partição, refletidas só no caminho do arquivo no S3, não no próprio Parquet.
const PROCESSOS_SCHEMA: SchemaDefinition = {
  cnj_number: { type: 'UTF8' },
  status_coleta: { type: 'UTF8', optional: true },
  motivo_erro: { type: 'UTF8', optional: true },
  enriquecido_em: { type: 'TIMESTAMP_MILLIS', optional: true },
  origem: { type: 'UTF8', optional: true },
  num_instancias: { type: 'INT32', optional: true },
};

const INSTANCIAS_SCHEMA: SchemaDefinition = {
  cnj_number: { type: 'UTF8' },
  instancia_id: { type: 'INT64' },
  grau: { type: 'UTF8', optional: true },
  classe: { type: 'UTF8', optional: true },
  area: { type: 'UTF8', optional: true },
  orgao_julgador: { type: 'UTF8', optional: true },
  data_distribuicao: { type: 'TIMESTAMP_MILLIS', optional: true },
  valor_causa: { type: 'DOUBLE', optional: true },
  arquivado: { type: 'BOOLEAN', optional: true },
  data_arquivamento: { type: 'TIMESTAMP_MILLIS', optional: true },
  assunto_principal: { type: 'UTF8', optional: true },
  assunto_principal_codigo: { type: 'INT32', optional: true },
  assuntos_json: { type: 'UTF8', optional: true },
  segredo: { type: 'BOOLEAN', optional: true },
  sistema: { type: 'UTF8', optional: true },
  last_update_time: { type: 'TIMESTAMP_MILLIS', optional: true },
};

const PARTES_SCHEMA: SchemaDefinition = {
  cnj_number: { type: 'UTF8' },
  instancia_id: { type: 'INT64' },
  parte_id: { type: 'INT64', optional: true },
  tipo: { type: 'UTF8', optional: true },
  polo: { type: 'UTF8', optional: true },
  nome: { type: 'UTF8', optional: true },
  doc_tipo: { type: 'UTF8', optional: true },
  doc_numero: { type: 'UTF8', optional: true },
  advogado_de: { type: 'INT64', optional: true },
  principal: { type: 'BOOLEAN', optional: true },
};

const MOVIMENTACOES_SCHEMA: SchemaDefinition = {
  cnj_number: { type: 'UTF8' },
  instancia_id: { type: 'INT64' },
  movimentacao_id: { type: 'INT64', optional: true },
  data_mov: { type: 'DATE', optional: true },
  conteudo: { type: 'UTF8', optional: true },
  pje_doc_id: { type: 'INT64', optional: true },
  texto: { type: 'UTF8', optional: true },
  unique_name_documento: { type: 'UTF8', optional: true },
};

function toDateOrNull(value: string | undefined | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// `Movimentacoes.data` chega formatado como DD/MM/YYYY (pt-BR) — `new Date(...)`
// interpreta isso como MM/DD/YYYY e vira "Invalid Date" pra qualquer dia > 12,
// perdendo a data silenciosamente. Faz o parse manual do formato brasileiro.
const BR_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function toDateFromBrOrNull(value: string | undefined | null): Date | null {
  if (!value) return null;

  const match = BR_DATE_PATTERN.exec(value.trim());
  if (!match) {
    return toDateOrNull(value);
  }

  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

interface AssuntoRaw {
  codigo?: string | number;
  descricao?: string;
  principal?: boolean;
}

// `Instancia.assunto` está tipado como `string`, mas o payload real do
// webhook manda um array de `{codigo, descricao, principal}` (confirmado no
// JSON cru do PJe) — passar isso direto pro campo UTF8 do Parquet quebrava a
// escrita de `pje_instancias` inteira (Promise.all rejeitava e as outras 3
// tabelas já tinham sido gravadas, mascarando o erro).
function extractAssuntos(assunto: unknown): {
  principal: string | null;
  principalCodigo: number | null;
  json: string | null;
} {
  if (typeof assunto === 'string') {
    return { principal: assunto || null, principalCodigo: null, json: null };
  }

  if (!Array.isArray(assunto) || assunto.length === 0) {
    return { principal: null, principalCodigo: null, json: null };
  }

  const lista = assunto as AssuntoRaw[];
  const principal = lista.find((a) => a?.principal) ?? lista[0];

  return {
    principal: principal?.descricao ?? null,
    principalCodigo: toNumberOrNull(principal?.codigo),
    json: JSON.stringify(lista),
  };
}

@Injectable()
export class SaveWebhookToAthenaService {
  private readonly logger = new Logger(SaveWebhookToAthenaService.name);
  private readonly s3Client: S3Client;
  private readonly dataLocation: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly parquetWriter: ParquetWriterService,
  ) {
    const accessKeyId = this.configService.get<string>('ATHENA_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'ATHENA_SECRET_ACCESS_KEY',
    );

    this.s3Client = new S3Client({
      region: this.configService.get<string>('ATHENA_REGION') || 'sa-east-1',
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });

    this.dataLocation = this.configService.get<string>('LAWSUIT_DATA_LOCATION');
  }

  async execute(body: Root): Promise<void> {
    if (body.status === 'NAO_ENCONTRADO') {
      this.logger.log(
        `Processo ${body.numero_processo} retornou NAO_ENCONTRADO — nada será gravado no Parquet.`,
      );
      return;
    }

    if (body.status === 'ERRO' && body.motivo_erro != null) {
      this.logger.log(
        `Processo ${body.numero_processo} retornou ERRO (motivo_erro=${JSON.stringify(body.motivo_erro)}) — nada será gravado no Parquet.`,
      );
      return;
    }

    const parsed = parseCnj(body.numero_processo);
    if (!parsed) {
      this.logger.warn(
        `Número de processo inválido no webhook: ${body.numero_processo}`,
      );
      return;
    }
    const { trt, anoProcesso } = parsed;
    const instancias = body.resposta?.instancias || [];

    const processoRow = {
      cnj_number: body.numero_processo,
      status_coleta: body.status ?? null,
      motivo_erro: body.motivo_erro != null ? String(body.motivo_erro) : null,
      enriquecido_em: new Date(),
      origem: body.resposta?.origem ?? null,
      num_instancias: instancias.length > 0 ? instancias.length : -1,
    };

    const instanciaRows = instancias.map((instancia: Instancia) => {
      const assuntos = extractAssuntos(instancia.assunto);
      return {
        cnj_number: body.numero_processo,
        instancia_id: instancia.id,
        grau: instancia.instancia ?? null,
        classe: instancia.classe ?? null,
        area: instancia.area ?? null,
        orgao_julgador: instancia.orgao_julgador ?? null,
        data_distribuicao: toDateOrNull(instancia.data_distribuicao),
        valor_causa: toNumberOrNull(instancia.valor_causa),
        arquivado: instancia.arquivado ?? null,
        data_arquivamento: toDateOrNull(instancia.data_arquivamento),
        assunto_principal: assuntos.principal,
        assunto_principal_codigo: assuntos.principalCodigo,
        assuntos_json: assuntos.json,
        segredo: instancia.segredo ?? null,
        sistema: instancia.sistema ?? null,
        last_update_time: toDateOrNull(instancia.last_update_time),
      };
    });

    const parteRows = instancias.flatMap((instancia: Instancia) =>
      (instancia.partes || []).map((parte) => ({
        cnj_number: body.numero_processo,
        instancia_id: instancia.id,
        parte_id: parte.id,
        tipo: parte.tipo ?? null,
        polo: parte.polo ?? null,
        nome: parte.nome ?? null,
        doc_tipo: parte.documento?.tipo ?? null,
        doc_numero: parte.documento?.numero ?? null,
        advogado_de: parte.advogado_de ?? null,
        principal: parte.principal ?? null,
      })),
    );

    const movimentacaoRows = instancias.flatMap((instancia: Instancia) =>
      (instancia.movimentacoes || []).map((mov) => ({
        cnj_number: body.numero_processo,
        instancia_id: instancia.id,
        movimentacao_id: mov.id,
        data_mov: toDateFromBrOrNull(mov.data),
        conteudo: mov.conteudo ?? null,
        // pje_doc_id (id numérico) não vem no payload do webhook — só no JSON
        // mais rico do coletor Python (communication-ingestor-juri).
        pje_doc_id: null,
        texto: mov.texto ?? null,
        unique_name_documento: mov.idUnicoDocumento ?? null,
      })),
    );

    await Promise.all([
      this.writeTable(
        'processos',
        PROCESSOS_SCHEMA,
        [processoRow],
        trt,
        anoProcesso,
      ),
      this.writeTable(
        'instancias',
        INSTANCIAS_SCHEMA,
        instanciaRows,
        trt,
        anoProcesso,
      ),
      this.writeTable('partes', PARTES_SCHEMA, parteRows, trt, anoProcesso),
      this.writeTable(
        'movimentacoes',
        MOVIMENTACOES_SCHEMA,
        movimentacaoRows,
        trt,
        anoProcesso,
      ),
    ]);
  }

  private async writeTable(
    table: string,
    schema: SchemaDefinition,
    rows: Record<string, unknown>[],
    trt: string,
    anoProcesso: number,
  ): Promise<void> {
    if (rows.length === 0) return;

    const buffer = await this.parquetWriter.writeRows(schema, rows);
    const key = `${this.s3KeyPrefix(table, trt, anoProcesso)}${randomUUID()}.parquet`;
    const bucket = this.bucketName();

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: 'application/octet-stream',
      }),
    );

    this.logger.log(
      `Gravado pje_${table}: ${rows.length} linha(s) em s3://${bucket}/${key}`,
    );
  }

  private bucketName(): string {
    return this.dataLocation.replace('s3://', '').split('/')[0];
  }

  private s3KeyPrefix(table: string, trt: string, anoProcesso: number): string {
    const withoutBucket = this.dataLocation
      .replace('s3://', '')
      .split('/')
      .slice(1)
      .join('/');
    return `${withoutBucket}/${table}/trt=${trt}/ano_processo=${anoProcesso}/`;
  }
}
