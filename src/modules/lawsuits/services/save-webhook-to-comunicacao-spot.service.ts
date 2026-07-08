import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  Instancia,
  Movimentacoes,
  Root,
} from 'src/modules/process/interfaces/process.interface';
import { parseCnj } from '../utils/cnj.util';
import { decideWebhookPersist } from '../utils/webhook-persist.util';

// O payload que o webhook manda é mais enxuto que o JSON que o coletor Python
// (communication-ingestor-juri) grava em comunicacao-spot — faltam campos
// como `url`/`extra_instancia`/`dados`/`audiencias`, e as movimentações não
// trazem `pje_doc_id`/`texto` quando nulos. Sem normalizar, cada webhook ia
// encolhendo o JSON existente (documentos consumidores esperam essas chaves
// presentes, mesmo que vazias/nulas).
function normalizeMovimentacao(mov: Movimentacoes): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    id: mov.id,
    pje_doc_id: mov.pje_doc_id ?? null,
    data: mov.data,
    conteudo: mov.conteudo,
    texto: mov.texto ?? null,
  };

  if (mov.uniqueNameDocumento != null) {
    normalized.uniqueNameDocumento = mov.uniqueNameDocumento;
  }

  // Só existe pra itens que são documento (o scraper só calcula isso quando
  // `item.documento` é true) — mesma regra do `uniqueNameDocumento`.
  if (mov.publico != null) {
    normalized.publico = mov.publico;
  }

  return normalized;
}

function normalizeInstancia(instancia: Instancia): Record<string, unknown> {
  return {
    id: instancia.id,
    url: instancia.url ?? null,
    sistema: instancia.sistema ?? null,
    instancia: instancia.instancia ?? null,
    extra_instancia: instancia.extra_instancia ?? '',
    tipo_precatorio: instancia.tipo_precatorio ?? null,
    segredo: instancia.segredo ?? false,
    numero: instancia.numero ?? null,
    numeros_alternativos: instancia.numeros_alternativos ?? [],
    assunto: instancia.assunto ?? [],
    classe: instancia.classe ?? null,
    area: instancia.area ?? null,
    data_distribuicao: instancia.data_distribuicao ?? null,
    orgao_julgador: instancia.orgao_julgador ?? null,
    pessoa_relator: instancia.pessoa_relator ?? null,
    moeda_valor_causa: instancia.moeda_valor_causa ?? 'R$',
    valor_causa: instancia.valor_causa ?? null,
    arquivado: instancia.arquivado ?? false,
    data_arquivamento: instancia.data_arquivamento ?? null,
    fisico: instancia.fisico ?? null,
    last_update_time: instancia.last_update_time ?? null,
    situacoes: instancia.situacoes ?? [],
    dados: instancia.dados ?? [],
    partes: instancia.partes ?? [],
    movimentacoes: (instancia.movimentacoes ?? []).map(normalizeMovimentacao),
    audiencias: instancia.audiencias ?? [],
    documentos_restritos: instancia.documentos_restritos ?? [],
    documentos: instancia.documentos ?? [],
  };
}

// O padrão do comunicacao-spot (escrito pelo coletor Python) sempre usa
// `opcoes: {documento: boolean}` — o scraper manda `{autos: true}` nos
// webhooks de documentos restritos, formato diferente que não deve vazar
// pro JSON espelho.
function normalizeOpcoes(opcoes: unknown): { documento: boolean } {
  if (opcoes && typeof opcoes === 'object' && 'autos' in opcoes) {
    return { documento: Boolean((opcoes as { autos: unknown }).autos) };
  }

  const documento =
    opcoes && typeof opcoes === 'object' && 'documento' in opcoes
      ? Boolean((opcoes as { documento: unknown }).documento)
      : false;

  return { documento };
}

// Mescla as instâncias do JSON já existente em comunicacao-spot com as do
// webhook atual — por `id` de instância, o novo sobrescreve o antigo, e
// instâncias antigas ausentes nesse webhook (ex: 1º grau já coletado antes,
// não incluído numa resposta só de 2º grau) são preservadas em vez de
// perdidas numa sobrescrita cega do arquivo inteiro. Normaliza as duas
// pontas — inclusive as antigas, pra autocorrigir arquivos que já ficaram
// incompletos antes dessa normalização existir.
function mergeInstancias(oldBody: Root | null, newBody: Root): Root {
  const oldInstancias = (oldBody?.resposta?.instancias ?? []).map(
    normalizeInstancia,
  );
  const newInstancias = (newBody.resposta?.instancias ?? []).map(
    normalizeInstancia,
  );

  const porId = new Map<number, Record<string, unknown>>();
  for (const instancia of oldInstancias) {
    porId.set(instancia.id as number, instancia);
  }
  for (const instancia of newInstancias) {
    porId.set(instancia.id as number, instancia);
  }

  return {
    ...newBody,
    opcoes: normalizeOpcoes(newBody.opcoes),
    resposta: {
      ...newBody.resposta,
      instancias: Array.from(porId.values()),
    },
  } as unknown as Root;
}

@Injectable()
export class SaveWebhookToComunicacaoSpotService {
  private readonly logger = new Logger(
    SaveWebhookToComunicacaoSpotService.name,
  );
  private readonly s3Client: S3Client;
  private readonly location: string;

  constructor(private readonly configService: ConfigService) {
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

    this.location = this.configService.get<string>(
      'COMUNICACAO_SPOT_LOCATION',
    );
  }

  async execute(body: Root): Promise<void> {
    const decision = decideWebhookPersist(body);
    if (!decision.persist) {
      this.logger.log(
        `Processo ${body.numero_processo} retornou ${decision.reason} — nada será atualizado em comunicacao-spot.`,
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

    const bucket = this.bucketName();
    const key = this.objectKey(body.numero_processo, parsed.trt, parsed.anoProcesso);

    const oldBody = await this.fetchExisting(bucket, key);
    const merged = mergeInstancias(oldBody, body);

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        // Sem indentação — o coletor Python (communication-ingestor-juri)
        // grava compacto, e o merge precisa manter o mesmo formato de
        // arquivo pra não destoar do resto do pipeline.
        Body: JSON.stringify(merged),
        ContentType: 'application/json',
      }),
    );

    this.logger.log(
      `${oldBody ? 'Atualizado' : 'Criado'} comunicacao-spot: s3://${bucket}/${key}`,
    );
  }

  private async fetchExisting(
    bucket: string,
    key: string,
  ): Promise<Root | null> {
    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      const raw = await response.Body?.transformToString('utf-8');
      return raw ? (JSON.parse(raw) as Root) : null;
    } catch (error) {
      if (error instanceof NoSuchKey) {
        return null;
      }
      this.logger.warn(
        `Falha ao buscar JSON existente em s3://${bucket}/${key}, seguindo sem merge: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private bucketName(): string {
    return this.location.replace('s3://', '').split('/')[0];
  }

  // O CNJ tribunal "00" (Justiça do Trabalho -> TST) tem pasta própria
  // "TST", separada de "TRT90" (CSJT) — confirmado direto no S3, já que
  // `parseCnj` (usado pro particionamento do Parquet) não distingue os dois.
  private objectKey(numeroCnj: string, trt: string, anoProcesso: number): string {
    const prefixWithoutBucket = this.location
      .replace('s3://', '')
      .split('/')
      .slice(1)
      .join('/');
    const pasta = trt === 'TRT0' ? 'TST' : trt;
    const cnjSemPontuacao = numeroCnj.replace(/\D/g, '');

    return `${prefixWithoutBucket}/${pasta}/${anoProcesso}/${cnjSemPontuacao}.json`;
  }
}
