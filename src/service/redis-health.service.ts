import { Injectable, Logger } from '@nestjs/common';
import * as Bull from 'bull';

@Injectable()
export class RedisHealthService {
  private readonly logger = new Logger(RedisHealthService.name);

  private parseConnection(url: string) {
    const parsed = new URL(url);
    const tls =
      parsed.protocol === 'rediss:' ? { rejectUnauthorized: false } : undefined;
    return {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      password: parsed.password || undefined,
      tls,
    };
  }

  async checkRedisHealth(redisUrl: string) {
    const connection = this.parseConnection(redisUrl);
    const queueName = 'redis-health-check';

    this.logger.log('Starting Redis health check...');
    this.logger.log(`Host: ${connection.host}`);
    this.logger.log(`Port: ${connection.port}`);
    this.logger.log(`TLS: ${connection.tls ? 'enabled' : 'disabled'}`);

    const queue = new Bull(queueName, { redis: connection });

    try {
      this.logger.log('Connecting to Redis...');
      await queue.isReady();
      this.logger.log('Redis connection successful.');

      this.logger.log('Adding job to queue...');
      const job = await queue.add('ping', { ts: Date.now() });
      this.logger.log(`Job added successfully (ID: ${job.id}).`);

      this.logger.log('Processing job...');
      queue.process(async (job) => {
        this.logger.log(`Processing job ID: ${job.id}`);
        return Promise.resolve();
      });

      this.logger.log('Redis health check passed.');
    } catch (error) {
      this.logger.error('Redis health check failed:', error.message);
      throw error;
    } finally {
      await queue.close().catch(() => {});
    }
  }
}
