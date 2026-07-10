import { BadGatewayException, Inject, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import Redis from 'ioredis';
import {
  CACHE_TTL_SECONDS,
  redisKeyForProcesso,
  toAthenaTimestampString,
} from './cache-processo-to-redis.service';
import { FindProcessoService } from './find-processo.service';

// Dispara a extração no scraping-robo-api direto pelo número do processo, sem
// nenhuma leitura/escrita no Mongo (Process/ProcessStatus) — o módulo lawsuits
// é a nova base (Athena), então evitamos aprofundar o acoplamento com o schema
// antigo que está sendo substituído.
@Injectable()
export class TriggerScrapingService {
  private readonly logger = new Logger(TriggerScrapingService.name);

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly findProcessoService: FindProcessoService,
  ) {}

  async execute(numeroCnj: string, options?: { documents?: boolean }) {
    await this.markAsSincronizando(numeroCnj);

    try {
      await axios.post(
        `${process.env.SCRAPING_BASE_URL}/processos/${numeroCnj}`,
        { documents: options?.documents ?? true, priority: true },
        {
          headers: {
            Authorization: `Bearer ${process.env.SCRAPING_API_KEY}`,
          },
        },
      );

      return { message: 'Processo enviado para extração' };
    } catch (error) {
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

  // Marca o processo como "SINCRONIZANDO" no cache do Redis antes mesmo de
  // chamar o scraping-robo-api — só troca `statusColeta`/`enriquecidoEm`,
  // preservando partes/movimentações/instâncias já cacheadas. Quem consome
  // via `FindProcessoService` continua vendo o último dado bom, só com o
  // status indicando que uma nova sincronização está em andamento, sem
  // esperar o webhook real chegar.
  //
  // Usa `FindProcessoService.execute()` (Redis, com fallback pro Athena) em
  // vez de ler só o Redis direto — sem isso, todo processo cujo cache no
  // Redis já tinha expirado (ou nunca existiu, ou foi limpo pelo próprio
  // `FindProcessoService` quando o Athena "alcançou" o cache — ver
  // `athenaCaughtUp`) nunca tinha SINCRONIZANDO marcado em lugar nenhum: o
  // front consultava e só via o último status concluído (SUCESSO/ERRO),
  // sem nenhum indício visual de que uma nova sincronização estava rodando.
  // Se nem Redis nem Athena têm nada pra esse CNJ ainda, não faz nada — não
  // tem dado prévio pra preservar, e falha aqui nunca deve impedir o
  // disparo da extração real.
  private async markAsSincronizando(numeroCnj: string): Promise<void> {
    try {
      const current = await this.findProcessoService.execute(numeroCnj);
      if (!current) {
        return;
      }

      const key = redisKeyForProcesso(numeroCnj);
      const updated = {
        ...current,
        statusColeta: 'SINCRONIZANDO',
        enriquecidoEm: toAthenaTimestampString(new Date()),
      };

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
}
