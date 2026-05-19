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

    return { status: 'ok', checks };
  }
}
