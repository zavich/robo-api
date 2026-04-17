import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthService {
  private readonly logger = new Logger(RedisHealthService.name);

  async checkRedisHealth(redisUrl: string) {
    const redis = new Redis(redisUrl, {
      tls: { rejectUnauthorized: false },
    });

    try {
      this.logger.log('Pinging Redis...');
      const result = await redis.ping();

      if (result !== 'PONG') {
        throw new Error('Unexpected Redis response');
      }

      this.logger.log('Redis health check passed.');
    } catch (error) {
      this.logger.error('Redis health check failed:', error.message);
      throw error;
    } finally {
      await redis.quit().catch(() => {});
    }
  }
}
