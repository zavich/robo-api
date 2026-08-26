import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { Root } from 'src/modules/process/interfaces/process.interface';
import { parseCnj } from 'src/modules/lawsuits/utils/cnj.util';
import {
  BUCKET_TTL_SECONDS,
  bucketKeyFor,
  DISPATCH_TTL_SECONDS,
  dispatchKey,
  FIELD,
  INFLIGHT_KEY,
  latencyBucketLabel,
  RECENT_KEY,
  RECENT_MAX,
} from '../utils/pipeline-metrics.util';

export interface DispatchInput {
  numeroCnj: string;
  userId?: string;
  documents?: boolean;
  origem?: string;
}

// Uma linha da tabela de execuções recentes.
export interface RecentEvent {
  numeroCnj: string;
  trt: string | null;
  status: string;
  motivoErro: string | null;
  // Tempo entre o disparo no robo-api e a chegada do webhook. `null` quando o
  // disparo não foi encontrado — webhook de uma coleta iniciada fora deste
  // serviço, ou disparo tão antigo que já expirou.
  latenciaMs: number | null;
  // Tempo gasto dentro do worker, medido pelo próprio scraping.
  scrapingMs: number | null;
  filaMs: number | null;
  documents: boolean | null;
  em: string;
}

// Registra os dois lados do ciclo de uma coleta: o disparo (robo-api →
// scraping-robo-api) e o retorno (webhook). É deliberadamente à prova de
// falhas — qualquer erro aqui é engolido com log, porque observabilidade
// quebrada não pode impedir uma extração de rodar nem um webhook de ser
// persistido.
@Injectable()
export class RecordPipelineEventService {
  private readonly logger = new Logger(RecordPipelineEventService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async recordDispatch(input: DispatchInput): Promise<void> {
    try {
      const agora = Date.now();
      const bucket = bucketKeyFor(new Date(agora));
      const trt = parseCnj(input.numeroCnj)?.trt ?? null;

      const multi = this.redis.multi();
      multi.hincrby(bucket, FIELD.disparos, 1);
      if (trt) {
        multi.hincrby(bucket, FIELD.trtTotal(trt), 1);
      }
      multi.expire(bucket, BUCKET_TTL_SECONDS);

      // ZADD sem NX: um novo disparo do mesmo CNJ reinicia a contagem, que é
      // o comportamento correto — o que interessa é a espera do pedido atual.
      multi.zadd(INFLIGHT_KEY, agora, input.numeroCnj);
      // Rede de segurança contra chave órfã: a poda por idade na leitura é
      // quem mantém o conjunto limpo, mas se este módulo parar de ser usado
      // não sobra ninguém para podar — e aí o TTL recolhe a chave.
      multi.expire(INFLIGHT_KEY, BUCKET_TTL_SECONDS);
      multi.set(
        dispatchKey(input.numeroCnj),
        JSON.stringify({
          startedAt: agora,
          userId: input.userId ?? null,
          documents: input.documents ?? null,
          origem: input.origem ?? null,
        }),
        'EX',
        DISPATCH_TTL_SECONDS,
      );

      await multi.exec();
    } catch (error) {
      this.logger.warn(
        `Falha ao registrar disparo de ${input.numeroCnj} nas métricas: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async recordWebhook(body: Root): Promise<void> {
    try {
      const numeroCnj = body?.numero_processo;
      if (!numeroCnj) return;

      const agora = Date.now();
      const bucket = bucketKeyFor(new Date(agora));
      const status = typeof body.status === 'string' ? body.status : 'SUCESSO';
      const motivoErro =
        typeof body.motivo_erro === 'string' && body.motivo_erro
          ? body.motivo_erro
          : null;

      const timings = body.timings;
      // O TRT dos timings é a fonte preferida (foi quem de fato roteou a
      // fila); o CNJ é o fallback para webhooks sem instrumentação.
      const trt =
        timings?.trt != null
          ? `TRT${timings.trt}`
          : (parseCnj(numeroCnj)?.trt ?? null);

      const latenciaMs = await this.resolveLatencia(numeroCnj, agora);

      const multi = this.redis.multi();
      multi.hincrby(bucket, FIELD.retornos, 1);
      multi.hincrby(bucket, FIELD.status(status), 1);
      if (motivoErro) {
        multi.hincrby(bucket, FIELD.motivo(motivoErro), 1);
      }
      if (trt) {
        // Contado à parte de `trtTotal` (disparos): um webhook pode chegar
        // sem disparo correspondente registrado — coleta iniciada por outro
        // caminho, ou disparo anterior ao deploy desta instrumentação.
        multi.hincrby(bucket, FIELD.trtRetornos(trt), 1);
        if (status === 'ERRO') {
          multi.hincrby(bucket, FIELD.trtErro(trt), 1);
        }
      }

      if (latenciaMs != null) {
        multi.hincrby(bucket, FIELD.latSum, latenciaMs);
        multi.hincrby(bucket, FIELD.latCount, 1);
        multi.hincrby(bucket, FIELD.latHist(latencyBucketLabel(latenciaMs)), 1);
        if (trt) {
          multi.hincrby(bucket, FIELD.trtLatSum(trt), latenciaMs);
          multi.hincrby(bucket, FIELD.trtLatCount(trt), 1);
        }
      }

      if (timings) {
        this.acumulaEstagio(multi, bucket, 'fila', timings.queueWaitMs);
        this.acumulaEstagio(multi, bucket, 'total', timings.totalMs);
        this.acumulaEstagio(multi, bucket, 'login', timings.stages?.login);
        this.acumulaEstagio(
          multi,
          bucket,
          'movimentacoes',
          timings.stages?.fetchMovimentacoes,
        );
        this.acumulaEstagio(
          multi,
          bucket,
          'documentosPublicos',
          timings.stages?.documentosPublicos,
        );
        this.acumulaEstagio(
          multi,
          bucket,
          'documentosRestritos',
          timings.stages?.documentosRestritos,
        );
      }

      multi.expire(bucket, BUCKET_TTL_SECONDS);
      multi.zrem(INFLIGHT_KEY, numeroCnj);

      const recente: RecentEvent = {
        numeroCnj,
        trt,
        status,
        motivoErro,
        latenciaMs,
        scrapingMs: timings?.totalMs ?? null,
        filaMs: timings?.queueWaitMs ?? null,
        documents: timings?.documents ?? null,
        em: new Date(agora).toISOString(),
      };
      multi.lpush(RECENT_KEY, JSON.stringify(recente));
      multi.ltrim(RECENT_KEY, 0, RECENT_MAX - 1);
      multi.expire(RECENT_KEY, BUCKET_TTL_SECONDS);

      await multi.exec();
    } catch (error) {
      this.logger.warn(
        `Falha ao registrar webhook de ${body?.numero_processo} nas métricas: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // O registro do disparo é lido mas NÃO apagado: uma coleta com documentos
  // manda dois webhooks (movimentações e depois autos), e apagar no primeiro
  // faria o segundo aparecer sem latência. O TTL é quem limpa.
  private async resolveLatencia(
    numeroCnj: string,
    agora: number,
  ): Promise<number | null> {
    const bruto = await this.redis.get(dispatchKey(numeroCnj));
    if (!bruto) return null;

    try {
      const { startedAt } = JSON.parse(bruto) as { startedAt?: number };
      if (typeof startedAt !== 'number') return null;

      const delta = agora - startedAt;
      // Relógio fora de ordem ou disparo do futuro: descarta em vez de
      // poluir a média com um valor negativo.
      return delta >= 0 ? delta : null;
    } catch {
      return null;
    }
  }

  private acumulaEstagio(
    multi: ReturnType<Redis['multi']>,
    bucket: string,
    estagio: string,
    valor: number | null | undefined,
  ): void {
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) {
      return;
    }

    multi.hincrby(bucket, FIELD.stageSum(estagio), Math.round(valor));
    multi.hincrby(bucket, FIELD.stageCount(estagio), 1);
  }
}
