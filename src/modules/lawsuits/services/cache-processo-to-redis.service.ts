import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import {
  Instancia,
  Movimentacoes,
  Root,
} from 'src/modules/process/interfaces/process.interface';
import { parseCnj } from '../utils/cnj.util';
import { decideWebhookPersist } from '../utils/webhook-persist.util';
import { extractAssuntos } from '../utils/assunto.util';
import { toDateFromBrOrNull } from '../utils/date.util';

// Anexos (ex: procuração, estatuto, CNPJ) ficam aninhados aqui, mesma forma
// que o scraper (normalizeResponse.ts) já entrega — ver `buildMovimentacao`.
interface BuiltMovimentacao {
  instanciaId: string | null;
  grau: string | null;
  movimentacaoId: string | null;
  data: string | null;
  conteudo: string | null;
  documentoId: string | null;
  texto: string | null;
  nomeDocumento: string | null;
  anexos?: BuiltMovimentacao[];
}

function buildMovimentacao(
  instancia: Instancia,
  mov: Movimentacoes,
): BuiltMovimentacao {
  return {
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
    anexos: mov.anexos?.length
      ? mov.anexos.map((anexo) => buildMovimentacao(instancia, anexo))
      : undefined,
  };
}

// TTL generoso — o Redis aqui funciona como cache de "última leitura
// conhecida", não como fonte de verdade; expira sozinho se o processo
// nunca mais receber webhook, em vez de crescer pra sempre.
export const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

// TTL da lista de espera e do lock de disparo — bem acima do tempo real de
// uma extração, só pra não deixar waiter/lock preso pra sempre se o webhook
// nunca chegar (ex.: scraping travou/caiu sem avisar).
export const WAITERS_TTL_SECONDS = 60 * 60;
export const INFLIGHT_TTL_SECONDS = 60 * 60;

// Cada usuário tem sua própria chave — o resultado de um scraping disparado
// por um usuário não pode ser lido por outro antes de virar registro oficial
// no banco (Athena/comunicacao-spot). Ver `redisWaitersKeyForProcesso` pra
// como o fan-out por usuário é resolvido quando o webhook chega.
export function redisKeyForProcesso(numeroCnj: string, userId: string): string {
  return `lawsuit:processo:${numeroCnj}:user:${userId}`;
}

// Set com os userIds aguardando o resultado de um scraping em andamento pra
// esse CNJ — permite dedupar o disparo real ao scraping-robo-api entre vários
// usuários pedindo o mesmo CNJ (só um dispara de fato; os demais só entram
// nessa lista) sem misturar o cache de um com o de outro.
export function redisWaitersKeyForProcesso(numeroCnj: string): string {
  return `lawsuit:waiters:${numeroCnj}`;
}

// Lock simples (SET NX) usado só pra decidir se um scraping já está em
// andamento pra esse CNJ — não guarda dado nenhum, só existe/não existe.
export function redisInflightKeyForProcesso(numeroCnj: string): string {
  return `lawsuit:inflight:${numeroCnj}`;
}

export async function addLawsuitWaiter(
  redis: Redis,
  numeroCnj: string,
  userId: string,
): Promise<void> {
  const key = redisWaitersKeyForProcesso(numeroCnj);
  await redis.sadd(key, userId);
  await redis.expire(key, WAITERS_TTL_SECONDS);
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
    (instancia.movimentacoes || []).map((mov) =>
      buildMovimentacao(instancia, mov),
    ),
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

  // Registra `userId` como aguardando o próximo resultado computado pra esse
  // CNJ, sem precisar que um scraping tenha sido disparado (usado por
  // `InsertLawsuitPlaceholderService` quando já existe dado real em
  // comunicacao-spot — reaproveita o mesmo mecanismo de fan-out abaixo em vez
  // de escrever direto numa chave global).
  async registerWaiter(numeroCnj: string, userId: string): Promise<void> {
    await addLawsuitWaiter(this.redis, numeroCnj, userId);
  }

  async execute(body: Root): Promise<void> {
    const waiters = await this.redis.smembers(
      redisWaitersKeyForProcesso(body.numero_processo),
    );

    if (waiters.length === 0) {
      // Ninguém está esperando esse resultado — não dá pra atribuir o dado a
      // um usuário específico, e gravar numa chave global voltaria a vazar
      // pra todo mundo. Webhook "órfão" (ex.: retry tardio depois do TTL da
      // lista de espera expirar) só não atualiza cache nenhum.
      this.logger.log(
        `Webhook de ${body.numero_processo} sem usuários aguardando — nada a cachear no Redis.`,
      );
      return;
    }

    const decision = decideWebhookPersist(body);
    if (!decision.persist) {
      // NAO_ENCONTRADO/ERRO sem dado novo de verdade — não sobrescreve
      // partes/movimentações/instâncias já cacheadas com uma resposta vazia,
      // mas ainda atualiza statusColeta/motivoErro. Sem isso, um processo
      // marcado SINCRONIZANDO (por `TriggerScrapingService`) que falha de
      // verdade na tentativa de sincronizar fica travado nesse status pra
      // sempre no cache — o front nunca sai do "Sincronizando" nem mostra o
      // erro real, mesmo a extração já tendo terminado (com falha).
      await this.applyStatusOnlyUpdate(body, waiters, decision.reason);
      await this.clearWaitState(body.numero_processo);
      return;
    }

    const parsed = parseCnj(body.numero_processo);
    if (!parsed) {
      this.logger.warn(
        `Número de processo inválido no webhook: ${body.numero_processo}`,
      );
      await this.clearWaitState(body.numero_processo);
      return;
    }

    const response = buildProcessoResponse(body, parsed.trt, parsed.anoProcesso);
    const payload = JSON.stringify(response);

    await Promise.all(
      waiters.map((userId) =>
        this.redis.set(
          redisKeyForProcesso(body.numero_processo, userId),
          payload,
          'EX',
          CACHE_TTL_SECONDS,
        ),
      ),
    );

    this.logger.log(
      `Cache atualizado no Redis pra ${waiters.length} usuário(s) aguardando: ${body.numero_processo}`,
    );

    await this.clearWaitState(body.numero_processo);
  }

  private async applyStatusOnlyUpdate(
    body: Root,
    waiters: string[],
    reason?: string,
  ): Promise<void> {
    await Promise.all(
      waiters.map((userId) =>
        this.applyStatusOnlyUpdateForUser(body, userId, reason),
      ),
    );
  }

  private async applyStatusOnlyUpdateForUser(
    body: Root,
    userId: string,
    reason?: string,
  ): Promise<void> {
    const key = redisKeyForProcesso(body.numero_processo, userId);
    const raw = await this.redis.get(key);

    if (!raw) {
      this.logger.log(
        `Processo ${body.numero_processo} retornou ${reason} — sem cache prévio no Redis pro usuário ${userId}, nada a atualizar.`,
      );
      return;
    }

    try {
      const cached = JSON.parse(raw) as Record<string, unknown>;
      const updated = {
        ...cached,
        statusColeta: body.status ?? null,
        motivoErro: body.motivo_erro != null ? String(body.motivo_erro) : null,
        enriquecidoEm: toAthenaTimestampString(new Date()),
      };

      await this.redis.set(
        key,
        JSON.stringify(updated),
        'EX',
        CACHE_TTL_SECONDS,
      );
      this.logger.log(
        `Processo ${body.numero_processo} retornou ${reason} — status atualizado no Redis do usuário ${userId}, mantendo dado anterior.`,
      );
    } catch (error) {
      this.logger.warn(
        `Falha ao atualizar status no cache Redis (${key}) para ${body.numero_processo}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async clearWaitState(numeroCnj: string): Promise<void> {
    await Promise.all([
      this.redis.del(redisWaitersKeyForProcesso(numeroCnj)),
      this.redis.del(redisInflightKeyForProcesso(numeroCnj)),
    ]);
  }
}
