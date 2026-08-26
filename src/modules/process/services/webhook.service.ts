import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { Root } from '../interfaces/process.interface';
import { NotificationsGateway } from 'src/gateway/notifications.gateway';
import { SaveWebhookToComunicacaoSpotService } from 'src/modules/lawsuits/services/save-webhook-to-comunicacao-spot.service';
import { CacheProcessoToRedisService } from 'src/modules/lawsuits/services/cache-processo-to-redis.service';
import { RecordPipelineEventService } from 'src/modules/monitoring/services/record-pipeline-event.service';

type IdempotencyAcquisition =
  | {
      acquired: true;
      previousState: 'NEW' | 'FAILED' | 'FAILED_PROCESS_NOT_FOUND';
    }
  | { acquired: false; currentState: string };

const ACQUIRE_IDEMPOTENCY_SCRIPT = `
local key = KEYS[1]
local ttl = ARGV[1]
local current = redis.call("GET", key)
if not current or current == "FAILED" or current == "FAILED_PROCESS_NOT_FOUND" then
  redis.call("SET", key, "PROCESSING", "EX", ttl)
  if current then return current end
  return "NEW"
end
return current
`;

@Injectable()
export class WebhookService implements OnModuleInit {
  private readonly logger = new Logger(WebhookService.name);
  private idempotencyScriptSha: string | null = null;

  constructor(
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
    private readonly saveWebhookToComunicacaoSpotService: SaveWebhookToComunicacaoSpotService,
    private readonly cacheProcessoToRedisService: CacheProcessoToRedisService,
    private readonly recordPipelineEventService: RecordPipelineEventService,
    private readonly gateway: NotificationsGateway,
  ) {}

  async onModuleInit() {
    await this.loadIdempotencyScript().catch((error: unknown) => {
      this.logger.warn(
        `Falha ao pre-carregar script de idempotencia: ${String((error as Error)?.message ?? error)}`,
      );
    });
  }

  async execute(body: Root, correlationId?: string) {
    this.logger.log(
      `Recebendo webhook de ${body.numero_processo} (correlationId=${correlationId ?? 'n/a'})`,
    );
    const idempotencyKey = this.buildIdempotencyKey(body);
    const acquisition = await this.acquireIdempotencyLock(idempotencyKey);

    if (acquisition.acquired === false) {
      this.logger.warn(
        `Webhook duplicado ignorado para ${body.numero_processo} (status: ${body.status}, key=${idempotencyKey}, state=${acquisition.currentState})`,
      );
      return;
    }

    if (acquisition.previousState !== 'NEW') {
      this.logger.warn(
        `Retentando webhook ${body.numero_processo} apos estado ${acquisition.previousState}`,
      );
    }

    try {
      // Sem Mongo, sem Parquet: o webhook busca o JSON existente em
      // comunicacao-spot (usado por outras ferramentas/pipeline fora do
      // robo-api) e mescla as instâncias novas nele. Em paralelo, atualiza o
      // cache no Redis — que fica mais atual que o Athena (batch), então
      // `FindProcessoService` prioriza ele na leitura.
      await Promise.all([
        this.saveWebhookToComunicacaoSpotService.execute(body),
        this.cacheProcessoToRedisService.execute(body),
      ]);

      await this.redis.set(idempotencyKey, 'DONE', 'EX', 60 * 60 * 24);
      // Depois da persistência e dentro do try: o que a tela de
      // monitoramento mostra é o ciclo que de fato se completou, não o
      // webhook que chegou e falhou ao ser gravado.
      await this.recordPipelineEventService.recordWebhook(body);
      this.gateway.processUpdated(body.numero_processo);
    } catch (error: unknown) {
      this.logger.error(
        `Erro ao processar a requisição: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.redis
        .set(idempotencyKey, 'FAILED', 'EX', 60 * 60)
        .catch(() => undefined);
      throw error;
    }
  }

  private buildIdempotencyKey(body: Root): string {
    if (!body.webhookId) {
      throw new BadRequestException(
        `Webhook ${body.numero_processo} chegou sem webhookId`,
      );
    }

    return `webhook:${body.webhookId}`;
  }

  private async acquireIdempotencyLock(
    idempotencyKey: string,
  ): Promise<IdempotencyAcquisition> {
    const ttlSeconds = 60 * 60 * 24;
    const result = (await this.executeIdempotencyScript(
      idempotencyKey,
      ttlSeconds.toString(),
    )) as string;

    if (
      result === 'NEW' ||
      result === 'FAILED' ||
      result === 'FAILED_PROCESS_NOT_FOUND'
    ) {
      return { acquired: true, previousState: result };
    }

    return { acquired: false, currentState: result };
  }

  private async loadIdempotencyScript(force = false) {
    if (this.idempotencyScriptSha && !force) {
      return this.idempotencyScriptSha;
    }

    this.idempotencyScriptSha = (await this.redis.script(
      'LOAD',
      ACQUIRE_IDEMPOTENCY_SCRIPT,
    )) as string;

    return this.idempotencyScriptSha;
  }

  private async executeIdempotencyScript(
    idempotencyKey: string,
    ttlSeconds: string,
  ) {
    const sha = await this.loadIdempotencyScript();

    try {
      return await this.redis.evalsha(sha, 1, idempotencyKey, ttlSeconds);
    } catch (error: unknown) {
      if (!String((error as Error)?.message ?? error).includes('NOSCRIPT')) {
        throw error;
      }

      const reloadedSha = await this.loadIdempotencyScript(true);
      return this.redis.evalsha(reloadedSha, 1, idempotencyKey, ttlSeconds);
    }
  }
}
