import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import Redis from 'ioredis';

@Controller()
export class AppController {
  constructor(
    @InjectConnection() private readonly mongooseConnection: Connection,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  @Get('health')
  async health() {
    const checks: Record<string, string> = {};
    let healthy = true;

    // MongoDB check
    if (this.mongooseConnection.readyState === 1) {
      checks.mongodb = 'ok';
    } else {
      checks.mongodb = `degraded (state: ${this.mongooseConnection.readyState})`;
      healthy = false;
    }

    // Redis check
    try {
      await this.redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'degraded';
      healthy = false;
    }

    if (!healthy) {
      throw new ServiceUnavailableException({ status: 'degraded', checks });
    }

    // EST-008: OOM detection
    const mem = process.memoryUsage();
    const rssMB = Math.round(mem.rss / 1024 / 1024);
    const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
    const OOM_THRESHOLD_MB = Number(process.env.OOM_THRESHOLD_MB ?? 1800);
    if (rssMB >= OOM_THRESHOLD_MB) {
      throw new ServiceUnavailableException(
        `OOM risk: RSS=${rssMB}MB >= threshold=${OOM_THRESHOLD_MB}MB`,
      );
    }

    return {
      status: 'ok',
      checks: { mongodb: 'ok', redis: 'ok' },
      memory: { rssMB, heapUsedMB },
    };
  }
}
