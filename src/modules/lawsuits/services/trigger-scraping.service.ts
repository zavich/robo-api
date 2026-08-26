import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import Redis from 'ioredis';
import { Root } from 'src/modules/process/interfaces/process.interface';
import {
  addLawsuitWaiter,
  buildProcessoResponse,
  CACHE_TTL_SECONDS,
  INFLIGHT_TTL_SECONDS,
  redisInflightKeyForProcesso,
  redisKeyForProcesso,
  toAthenaTimestampString,
} from './cache-processo-to-redis.service';
import { FindProcessoService } from './find-processo.service';
import { RecordPipelineEventService } from 'src/modules/monitoring/services/record-pipeline-event.service';
import { parseCnj } from '../utils/cnj.util';

// Dispara a extração no scraping-robo-api direto pelo número do processo, sem
// nenhuma leitura/escrita no Mongo (Process/ProcessStatus) — o módulo lawsuits
// é a nova base (Athena), então evitamos aprofundar o acoplamento com o schema
// antigo que está sendo substituído.

// O disparo é só um enfileiramento do outro lado (responde na hora); um
// tempo alto aqui não é espera legítima, é conexão pendurada segurando o
// request do usuário e, no lote, uma das 5 vagas de concorrência.
const SCRAPING_DISPATCH_TIMEOUT_MS = 15_000;

@Injectable()
export class TriggerScrapingService {
  private readonly logger = new Logger(TriggerScrapingService.name);

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly findProcessoService: FindProcessoService,
    private readonly recordPipelineEventService: RecordPipelineEventService,
  ) {}

  async execute(
    numeroCnj: string,
    userId: string,
    options?: { documents?: boolean },
  ) {
    // Registra o usuário como aguardando o resultado antes de qualquer outra
    // coisa — mesmo se o disparo real for dedupado (ver `claimInflight`)
    // abaixo, ele precisa estar na lista pra receber seu próprio cache
    // quando o webhook chegar.
    await addLawsuitWaiter(this.redis, numeroCnj, userId);
    await this.markAsSincronizando(numeroCnj, userId);

    const claimed = await this.claimInflight(numeroCnj);
    if (!claimed) {
      // Já existe uma extração em andamento pra esse CNJ (disparada por
      // outro usuário) — não faz sentido pagar duas vezes o mesmo captcha.
      // O usuário atual já está registrado como waiter acima, então recebe
      // seu próprio cache assim que o webhook em andamento responder.
      this.logger.log(
        `Extração já em andamento para ${numeroCnj} — ${userId} entrou na lista de espera, sem novo disparo.`,
      );
      return {
        message: 'Processo já está sendo sincronizado — aguardando resultado',
      };
    }

    try {
      const documents = options?.documents ?? true;

      await axios.post(
        `${process.env.SCRAPING_BASE_URL}/processos/${numeroCnj}`,
        { documents, priority: true },
        {
          headers: {
            Authorization: `Bearer ${process.env.SCRAPING_API_KEY}`,
          },
          timeout: SCRAPING_DISPATCH_TIMEOUT_MS,
        },
      );

      // Só depois do POST aceito: registrar antes contaria como disparo uma
      // chamada que o scraping recusou, inflando o "em andamento" com coletas
      // que nunca vão gerar webhook.
      await this.recordPipelineEventService.recordDispatch({
        numeroCnj,
        userId,
        documents,
      });

      return { message: 'Processo enviado para extração' };
    } catch (error) {
      // Sem isso, o lock ficaria "preso" até o TTL expirar mesmo sem
      // nenhuma extração de verdade rodando — todo mundo que pedisse esse
      // CNJ nesse meio tempo só entraria na fila de espera, esperando um
      // webhook que nunca vai chegar.
      await this.redis
        .del(redisInflightKeyForProcesso(numeroCnj))
        .catch(() => undefined);

      const axiosError = error as AxiosError;
      const responseData = axiosError.response?.data as
        | { error?: string; message?: string }
        | string
        | undefined;
      const errorDetail =
        (typeof responseData === 'string'
          ? responseData
          : responseData?.error || responseData?.message) ||
        axiosError.message ||
        'Erro não detalhado pelo serviço de extração';

      this.logger.error(
        `Erro ao enviar ${numeroCnj} para extração: ${errorDetail}`,
      );
      throw new BadGatewayException(
        'Erro ao disparar extração no scraping-robo-api',
      );
    }
  }

  // Lock (SET NX) que decide se essa chamada é quem de fato dispara a
  // extração no scraping-robo-api, ou se só entra na lista de espera de um
  // scraping já em andamento pra esse CNJ.
  private async claimInflight(numeroCnj: string): Promise<boolean> {
    const key = redisInflightKeyForProcesso(numeroCnj);
    const result = await this.redis.set(
      key,
      '1',
      'EX',
      INFLIGHT_TTL_SECONDS,
      'NX',
    );
    return result === 'OK';
  }

  // Marca o processo como "SINCRONIZANDO" no cache do Redis do usuário antes
  // mesmo de chamar o scraping-robo-api — se já havia dado prévio (redis do
  // usuário, comunicacao-spot ou Athena), só troca `statusColeta`/
  // `enriquecidoEm`, preservando partes/movimentações/instâncias já
  // cacheadas. Quem consome via `FindProcessoService` continua vendo o
  // último dado bom, só com o status indicando que uma nova sincronização
  // está em andamento, sem esperar o webhook real chegar.
  //
  // Usa `FindProcessoService.execute()` (Redis do usuário, com fallback pro
  // Athena) em vez de ler só o Redis direto — sem isso, todo processo cujo
  // cache no Redis já tinha expirado (ou nunca existiu) nunca tinha
  // SINCRONIZANDO marcado em lugar nenhum: o front consultava e só via o
  // último status concluído (SUCESSO/ERRO), sem nenhum indício visual de
  // que uma nova sincronização estava rodando.
  //
  // Quando não há NENHUM dado prévio (CNJ nunca visto: nem Redis, nem
  // Athena — ex.: primeira busca de um processo novo via `/search`), monta
  // um placeholder mínimo (via `buildProcessoResponse` com instâncias
  // vazias) em vez de simplesmente não escrever nada — sem isso, o GET
  // continuava 404 até o webhook real responder (podendo levar minutos),
  // sem nenhum jeito do front mostrar "buscando"/acompanhar o progresso.
  // Falha aqui nunca deve impedir o disparo da extração real.
  private async markAsSincronizando(
    numeroCnj: string,
    userId: string,
  ): Promise<void> {
    try {
      const current = await this.findProcessoService.execute(numeroCnj, userId);

      const updated = current
        ? {
            ...current,
            statusColeta: 'SINCRONIZANDO',
            enriquecidoEm: toAthenaTimestampString(new Date()),
          }
        : this.buildEmptySincronizandoPlaceholder(numeroCnj);

      if (!updated) {
        return;
      }

      const key = redisKeyForProcesso(numeroCnj, userId);
      await this.redis.set(
        key,
        JSON.stringify(updated),
        'EX',
        CACHE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(
        `Falha ao marcar ${numeroCnj} como SINCRONIZANDO no Redis, seguindo sem isso: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private buildEmptySincronizandoPlaceholder(numeroCnj: string) {
    const parsed = parseCnj(numeroCnj);
    if (!parsed) {
      return null;
    }

    return buildProcessoResponse(
      {
        numero_processo: numeroCnj,
        status: 'SINCRONIZANDO',
        motivo_erro: null,
        resposta: { instancias: [], origem: '' },
      } as unknown as Root,
      parsed.trt,
      parsed.anoProcesso,
    );
  }
}
