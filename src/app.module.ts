import { BullModule } from '@nestjs/bullmq';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import Redis from 'ioredis';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { RedisModule } from './connection/redis.module';
import { ApiKeyAuthGuard } from './modules/authentication/guards/apikey-auth.guard';
import { PermissionsGuard } from './modules/authentication/guards/permissions.guard';
import { DatabaseModule } from './database/database.module';
import { AuthenticationModule } from './modules/authentication/authentication.module';
import { CompanyModule } from './modules/company/company.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ObservationModule } from './modules/observation/observation.module';
import { PipedriveModule } from './modules/pipedrive/pipedrive.module';
import { ProcessModule } from './modules/process/process.module';
import { PromptModule } from './modules/prompts/prompt.module';
import { ReasonLossModule } from './modules/reason-loss/reason-refusal.module';
import { StepsModule } from './modules/steps/steps.module';
import { UserModule } from './modules/user/user.module';
import { RedisHealthService } from './service/redis-health.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: process.env.NODE_ENV === 'local' ? '.env' : undefined,
    }),
    BullModule.forRootAsync({
      imports: [RedisModule],
      inject: ['REDIS_CLIENT'],
      useFactory: (redis: Redis) => ({
        connection: redis,
      }),
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 1 minuto em ms (v6 usa ms)
        limit: 100,  // 100 requests/min por IP (geral)
      },
      {
        name: 'auth',
        ttl: 60000,  // 1 minuto em ms
        limit: 10,   // 10 tentativas de login por IP por minuto
      },
    ]),
    DatabaseModule,
    MongooseModule.forRoot(process.env.DATABASE_URL),
    ProcessModule,
    CompanyModule,
    AuthenticationModule,
    ObservationModule,
    StepsModule,
    PromptModule,
    PipedriveModule,
    ReasonLossModule,
    NotificationModule,
    UserModule,
  ],
  controllers: [AppController],
  providers: [
    RedisHealthService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: ApiKeyAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
