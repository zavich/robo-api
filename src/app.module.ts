import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { RedisModule } from './connection/redis.module';
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
      useFactory: (redis: any) => ({
        connection: redis,
      }),
    }),
    ScheduleModule.forRoot(),
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
  providers: [RedisHealthService],
})
export class AppModule {}
