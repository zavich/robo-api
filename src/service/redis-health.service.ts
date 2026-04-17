import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

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

    const queue = new Queue(queueName, { connection });

    try {
      this.logger.log('Connecting to Redis...');
      this.logger.log('Redis connection successful.');

      this.logger.log('Adding job to queue...');
      const job = await queue.add('ping', { ts: Date.now() });
      this.logger.log(`Job added successfully (ID: ${job.id}).`);

      this.logger.log('Processing job...');
      // Use Worker to process jobs in BullMQ
      const { Worker } = await import('bullmq');
      const worker = new Worker(
        queueName,
        async (job) => {
          this.logger.log(`Processing job ID: ${job.id}`);
          return Promise.resolve();
        },
        { connection },
      );

      // Wait for the job to be processed
      await new Promise<void>((resolve, reject) => {
        worker.on('completed', () => {
          this.logger.log('Job processed successfully.');
          resolve();
        });
        worker.on('failed', (job, err) => {
          this.logger.error(`Job failed: ${err.message}`);
          reject(err);
        });
      });

      await worker.close();

      this.logger.log('Redis health check passed.');
    } catch (error) {
      this.logger.error('Redis health check failed:', error.message);
      throw error;
    } finally {
      await queue.close().catch(() => {});
    }
  }
}
