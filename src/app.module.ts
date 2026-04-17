import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
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
import { AppController } from './app.controller';
import { RedisHealthService } from './service/redis-health.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        url: configService.get<string>('REDIS_URL'),
        tls: {
          rejectUnauthorized: false,
        },
        limiter: { max: 2, duration: 1000 },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 1000,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
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
