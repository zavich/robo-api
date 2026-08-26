import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import {
  bucketIdsForRange,
  bucketKeyFromId,
  estimatePercentile,
  FIELD,
  INFLIGHT_HORIZON_MS,
  INFLIGHT_KEY,
  media,
  RECENT_KEY,
  RECENT_MAX,
  STUCK_THRESHOLD_MS,
  StageName,
} from '../utils/pipeline-metrics.util';
import { RecentEvent } from './record-pipeline-event.service';

export interface PontoSerie {
  bucket: string;
  disparos: number;
  retornos: number;
  sucesso: number;
  naoEncontrado: number;
  erro: number;
  latenciaMediaMs: number | null;
}

export interface ResumoTrt {
  trt: string;
  disparos: number;
  retornos: number;
  erros: number;
  taxaErro: number | null;
  latenciaMediaMs: number | null;
}

export interface MotivoErro {
  motivo: string;
  total: number;
  percentual: number;
}

export interface EstagioResumo {
  estagio: StageName;
  mediaMs: number | null;
  amostras: number;
}

export interface CnjTravado {
  numeroCnj: string;
  esperandoHaMs: number;
  desde: string;
}

export interface PipelineSnapshot {
  janela: { horas: number; de: string; ate: string };
  totais: {
    disparos: number;
    retornos: number;
    sucesso: number;
    naoEncontrado: number;
    erro: number;
    taxaSucesso: number | null;
    emAndamento: number;
    travados: number;
  };
  latencia: {
    mediaMs: number | null;
    p50Ms: number | null;
    p95Ms: number | null;
    amostras: number;
  };
  estagios: EstagioResumo[];
  errosPorMotivo: MotivoErro[];
  porTrt: ResumoTrt[];
  serie: PontoSerie[];
  travadosAgora: CnjTravado[];
  recentes: RecentEvent[];
}

// Monta a fotografia do pipeline lida pela tela de monitoramento. Toda a
// agregação pesada já aconteceu na escrita (buckets horários), então aqui
// sobra ler os buckets da janela numa única ida ao Redis e somar.
@Injectable()
export class FetchPipelineMetricsService {
  private readonly logger = new Logger(FetchPipelineMetricsService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async execute(horas: number, agora = new Date()): Promise<PipelineSnapshot> {
    const bucketIds = bucketIdsForRange(agora, horas);

    const [buckets, inflight, recentes] = await Promise.all([
      this.lerBuckets(bucketIds),
      this.lerInflight(agora),
      this.lerRecentes(),
    ]);

    const serie: PontoSerie[] = [];
    const totais = {
      disparos: 0,
      retornos: 0,
      sucesso: 0,
      naoEncontrado: 0,
      erro: 0,
    };
    const histograma: Record<string, number> = {};
    const motivos = new Map<string, number>();
    const trts = new Map<
      string,
      ResumoTrt & { latSum: number; latCount: number }
    >();
    const estagios = new Map<string, { soma: number; contagem: number }>();
    let latSomaTotal = 0;
    let latContagemTotal = 0;

    bucketIds.forEach((bucketId, indice) => {
      const hash = buckets[indice] ?? {};
      const num = (campo: string) => Number(hash[campo] ?? 0) || 0;

      const disparos = num(FIELD.disparos);
      const retornos = num(FIELD.retornos);
      const sucesso = num(FIELD.status('SUCESSO'));
      const naoEncontrado = num(FIELD.status('NAO_ENCONTRADO'));
      const erro = num(FIELD.status('ERRO'));
      const latSum = num(FIELD.latSum);
      const latCount = num(FIELD.latCount);

      totais.disparos += disparos;
      totais.retornos += retornos;
      totais.sucesso += sucesso;
      totais.naoEncontrado += naoEncontrado;
      totais.erro += erro;
      latSomaTotal += latSum;
      latContagemTotal += latCount;

      serie.push({
        bucket: bucketId,
        disparos,
        retornos,
        sucesso,
        naoEncontrado,
        erro,
        latenciaMediaMs: media(latSum, latCount),
      });

      // Famílias de campo com chave dinâmica (motivo de erro, TRT, estágio,
      // faixa do histograma) são descobertas varrendo o hash — não dá para
      // saber de antemão quais motivos ou tribunais apareceram na janela.
      for (const [campo, valorBruto] of Object.entries(hash)) {
        const valor = Number(valorBruto) || 0;
        if (valor === 0) continue;

        if (campo.startsWith('motivo:')) {
          const motivo = campo.slice('motivo:'.length);
          motivos.set(motivo, (motivos.get(motivo) ?? 0) + valor);
          continue;
        }

        if (campo.startsWith('lat:h:')) {
          const faixa = campo.slice('lat:h:'.length);
          histograma[faixa] = (histograma[faixa] ?? 0) + valor;
          continue;
        }

        if (campo.startsWith('stage:')) {
          const [, estagio, tipo] = campo.split(':');
          const atual = estagios.get(estagio) ?? { soma: 0, contagem: 0 };
          if (tipo === 'sum') atual.soma += valor;
          if (tipo === 'count') atual.contagem += valor;
          estagios.set(estagio, atual);
          continue;
        }

        if (campo.startsWith('trt:')) {
          const partes = campo.split(':');
          const nomeTrt = partes[1];
          const atual = trts.get(nomeTrt) ?? {
            trt: nomeTrt,
            disparos: 0,
            retornos: 0,
            erros: 0,
            taxaErro: null,
            latenciaMediaMs: null,
            latSum: 0,
            latCount: 0,
          };

          if (partes[2] === 'total') atual.disparos += valor;
          if (partes[2] === 'retornos') atual.retornos += valor;
          if (partes[2] === 'erro') atual.erros += valor;
          if (partes[2] === 'lat' && partes[3] === 'sum') atual.latSum += valor;
          if (partes[2] === 'lat' && partes[3] === 'count') {
            atual.latCount += valor;
          }

          trts.set(nomeTrt, atual);
        }
      }
    });

    const totalMotivos = [...motivos.values()].reduce((a, b) => a + b, 0);

    return {
      janela: {
        horas,
        de: bucketIds[0] ?? '',
        ate: bucketIds[bucketIds.length - 1] ?? '',
      },
      totais: {
        ...totais,
        // Sobre os retornos, não sobre os disparos: um disparo que ainda não
        // voltou não é uma falha, e contá-lo como tal faria a taxa despencar
        // sempre que houvesse fila — exatamente quando a tela é consultada.
        taxaSucesso:
          totais.retornos > 0
            ? Number((totais.sucesso / totais.retornos).toFixed(4))
            : null,
        emAndamento: inflight.emAndamento,
        travados: inflight.travados.length,
      },
      latencia: {
        mediaMs: media(latSomaTotal, latContagemTotal),
        p50Ms: estimatePercentile(histograma, 0.5),
        p95Ms: estimatePercentile(histograma, 0.95),
        amostras: latContagemTotal,
      },
      estagios: (
        [
          'fila',
          'login',
          'movimentacoes',
          'documentosPublicos',
          'documentosRestritos',
          'total',
        ] as StageName[]
      ).map((estagio) => {
        const dados = estagios.get(estagio);
        return {
          estagio,
          mediaMs: dados ? media(dados.soma, dados.contagem) : null,
          amostras: dados?.contagem ?? 0,
        };
      }),
      errosPorMotivo: [...motivos.entries()]
        .map(([motivo, total]) => ({
          motivo,
          total,
          percentual:
            totalMotivos > 0 ? Number((total / totalMotivos).toFixed(4)) : 0,
        }))
        .sort((a, b) => b.total - a.total),
      porTrt: [...trts.values()]
        .map(({ latSum, latCount, ...resumo }) => ({
          ...resumo,
          taxaErro:
            resumo.retornos > 0
              ? Number((resumo.erros / resumo.retornos).toFixed(4))
              : null,
          latenciaMediaMs: media(latSum, latCount),
        }))
        .sort((a, b) => b.disparos + b.retornos - (a.disparos + a.retornos)),
      serie,
      travadosAgora: inflight.travados,
      recentes,
    };
  }

  private async lerBuckets(
    bucketIds: string[],
  ): Promise<Record<string, string>[]> {
    if (bucketIds.length === 0) return [];

    const pipeline = this.redis.pipeline();
    for (const id of bucketIds) {
      pipeline.hgetall(bucketKeyFromId(id));
    }

    const resultados = await pipeline.exec();
    return (resultados ?? []).map(([erro, valor]) => {
      if (erro || !valor) return {};
      return valor as Record<string, string>;
    });
  }

  // Disparos ainda sem webhook. Os que passaram do limite são listados
  // individualmente: é a informação acionável quando algo trava — qual CNJ
  // reenviar — e não apenas quantos travaram.
  private async lerInflight(agora: Date): Promise<{
    emAndamento: number;
    travados: CnjTravado[];
  }> {
    try {
      const limite = agora.getTime() - STUCK_THRESHOLD_MS;

      // Poda preguiçosa antes de contar: entradas velhas demais são coletas
      // perdidas cujo webhook nunca chegou. Fica na leitura (e não só na
      // escrita) para que o número esteja certo mesmo depois de um período
      // sem disparo nenhum.
      await this.redis.zremrangebyscore(
        INFLIGHT_KEY,
        '-inf',
        agora.getTime() - INFLIGHT_HORIZON_MS,
      );

      const [emAndamento, travadosBrutos] = await Promise.all([
        this.redis.zcard(INFLIGHT_KEY),
        this.redis.zrangebyscore(
          INFLIGHT_KEY,
          '-inf',
          limite,
          'WITHSCORES',
          'LIMIT',
          0,
          50,
        ),
      ]);

      const travados: CnjTravado[] = [];
      for (let i = 0; i < travadosBrutos.length; i += 2) {
        const numeroCnj = travadosBrutos[i];
        const desde = Number(travadosBrutos[i + 1]);
        if (!numeroCnj || !Number.isFinite(desde)) continue;

        travados.push({
          numeroCnj,
          esperandoHaMs: agora.getTime() - desde,
          desde: new Date(desde).toISOString(),
        });
      }

      return { emAndamento, travados };
    } catch (error) {
      this.logger.warn(
        `Falha ao ler disparos em andamento: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { emAndamento: 0, travados: [] };
    }
  }

  private async lerRecentes(): Promise<RecentEvent[]> {
    try {
      const brutos = await this.redis.lrange(RECENT_KEY, 0, RECENT_MAX - 1);
      return brutos
        .map((item) => {
          try {
            return JSON.parse(item) as RecentEvent;
          } catch {
            return null;
          }
        })
        .filter((item): item is RecentEvent => item !== null);
    } catch (error) {
      this.logger.warn(
        `Falha ao ler execuções recentes: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }
}
