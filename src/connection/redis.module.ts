import { Global, Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';

const logger = new Logger('RedisModule');

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => {
        const url = process.env.REDIS_URL;

        if (!url) {
          throw new Error('REDIS_URL não definido no ambiente');
        }

        const client = new Redis(url, {
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          lazyConnect: false,
          retryStrategy: (times: number) => {
            if (times > 20) {
              logger.error('[Redis] Máximo de tentativas atingido. Desistindo.');
              return null;
            }
            const delay = Math.min(times * 200, 5000);
            logger.warn(`[Redis] Tentativa ${times} de reconexão em ${delay}ms`);
            return delay;
          },
          reconnectOnError: (err) => {
            logger.error('[Redis reconnect error]', err.message);
            return true;
          },
        });

        client.on('ready', () => {
          logger.log('[Redis] Conexão estabelecida com sucesso');
        });

        client.on('reconnecting', () => {
          logger.warn('[Redis] Reconectando...');
        });

        client.on('error', (err) => {
          logger.error('[Redis] error:', err.message);
        });

        return client;
      },
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
