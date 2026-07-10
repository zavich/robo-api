import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import {
  Instancia,
  Root,
} from 'src/modules/process/interfaces/process.interface';
import { parseCnj } from '../utils/cnj.util';
import { decideWebhookPersist } from '../utils/webhook-persist.util';
import { extractAssuntos } from '../utils/assunto.util';
import { toDateFromBrOrNull } from '../utils/date.util';

// TTL generoso — o Redis aqui funciona como cache de "última leitura
// conhecida", não como fonte de verdade; expira sozinho se o processo
// nunca mais receber webhook, em vez de crescer pra sempre.
export const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

export function redisKeyForProcesso(numeroCnj: string): string {
  return `lawsuit:processo:${numeroCnj}`;
}

function toStringOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

// Formata igual ao TIMESTAMP do Athena quando serializado em resultado de
// query: "YYYY-MM-DD HH:mm:ss.SSS", sem "T" nem "Z".
export function toAthenaTimestampString(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

// Monta a mesma forma de resposta que `FindProcessoService.execute()`
// devolve a partir do Athena — assim o cache pode substituir a consulta sem
// o front precisar saber a diferença. Todo campo de `LawsuitParte`/
// `LawsuitInstancia`/`LawsuitMovimentacao` no front é tipado como
// `string | null`, reflexo de vir sempre do Athena (que stringifica tudo em
// resultado de query — números, booleanos, tudo vira string). O JSON do
// webhook manda tipo nativo (number/boolean) — sem converter aqui, qualquer
// comparação estrita no front (ex: `principal === "true"`) quebra em
// silêncio pra quem lê do cache no Redis em vez do Athena.
export function buildProcessoResponse(
  body: Root,
  trt: string,
  anoProcesso: number,
) {
  const instancias = body.resposta?.instancias || [];

  const partes = instancias.flatMap((instancia: Instancia) =>
    (instancia.partes || []).map((parte) => ({
      parteId: toStringOrNull(parte.id),
      instanciaId: toStringOrNull(instancia.id),
      tipo: parte.tipo ?? null,
      polo: parte.polo ?? null,
      nome: parte.nome ?? null,
      docTipo: parte.documento?.tipo ?? null,
      docNumero: parte.documento?.numero ?? null,
      advogadoDe: toStringOrNull(parte.advogado_de),
      principal: toStringOrNull(parte.principal),
    })),
  );

  const movimentacoes = instancias.flatMap((instancia: Instancia) =>
    (instancia.movimentacoes || []).map((mov) => ({
      instanciaId: toStringOrNull(instancia.id),
      grau: instancia.instancia ?? null,
      movimentacaoId: toStringOrNull(mov.id),
      // Só a data (YYYY-MM-DD) — igual ao que o Athena devolve pra
      // `data_mov` (coluna DATE). Guardar o `Date` inteiro aqui serializa
      // como ISO com hora e "Z" no JSON, e o front exibe esse valor cru.
      data: toDateFromBrOrNull(mov.data)?.toISOString().slice(0, 10) ?? null,
      conteudo: mov.conteudo ?? null,
      documentoId: toStringOrNull(mov.pje_doc_id),
      texto: mov.texto ?? null,
      nomeDocumento: mov.uniqueNameDocumento ?? null,
    })),
  );

  const instanciasOut = instancias.map((instancia: Instancia) => {
    const assuntos = extractAssuntos(instancia.assunto);
    return {
      instanciaId: toStringOrNull(instancia.id),
      grau: instancia.instancia ?? null,
      classe: instancia.classe ?? null,
      area: instancia.area ?? null,
      orgaoJulgador: instancia.orgao_julgador ?? null,
      dataDistribuicao: instancia.data_distribuicao ?? null,
      valorCausa: toStringOrNull(instancia.valor_causa),
      arquivado: toStringOrNull(instancia.arquivado),
      dataArquivamento: instancia.data_arquivamento ?? null,
      assuntoPrincipal: assuntos.principal,
      assuntoPrincipalCodigo: toStringOrNull(assuntos.principalCodigo),
      assuntosJson: assuntos.json,
      segredo: toStringOrNull(instancia.segredo),
      sistema: instancia.sistema ?? null,
      lastUpdateTime: instancia.last_update_time ?? null,
    };
  });

  return {
    cnjNumber: body.numero_processo,
    statusColeta: body.status ?? null,
    motivoErro: body.motivo_erro != null ? String(body.motivo_erro) : null,
    enriquecidoEm: toAthenaTimestampString(new Date()),
    origem: body.resposta?.origem ?? null,
    numInstancias: String(instancias.length > 0 ? instancias.length : -1),
    trt,
    anoProcesso: String(anoProcesso),
    partes,
    movimentacoes,
    instancias: instanciasOut,
  };
}

@Injectable()
export class CacheProcessoToRedisService {
  private readonly logger = new Logger(CacheProcessoToRedisService.name);

  constructor(
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  async execute(body: Root): Promise<void> {
    const decision = decideWebhookPersist(body);
    if (!decision.persist) {
      this.logger.log(
        `Processo ${body.numero_processo} retornou ${decision.reason} — cache no Redis não será atualizado.`,
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

    const response = buildProcessoResponse(body, parsed.trt, parsed.anoProcesso);
    const key = redisKeyForProcesso(body.numero_processo);

    await this.redis.set(
      key,
      JSON.stringify(response),
      'EX',
      CACHE_TTL_SECONDS,
    );

    this.logger.log(`Cache atualizado no Redis: ${key}`);
  }
}
