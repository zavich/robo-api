// import * as dotenv from 'dotenv';
// Carrega o .env o mais cedo possível (antes do NestFactory.create)
// dotenv.config();

import { createBullBoard } from '@bull-board/api';
import { BaseAdapter } from '@bull-board/api/dist/src/queueAdapters/base';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import { Queue } from 'bullmq';
import * as cookieParser from 'cookie-parser';
import { setMaxListeners } from 'events';
import { patchNestJsSwagger } from 'nestjs-zod';
import { AppModule } from './app.module';
import { Env } from './config/zod/env';

const bootstrapLogger = new Logger('Bootstrap');

process.on('unhandledRejection', (reason) => {
  bootstrapLogger.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  bootstrapLogger.error('Uncaught Exception:', error);
  process.exit(1);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('v1', { exclude: ['health'] });
  patchNestJsSwagger();
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'https://scraping-api.juri.capital', 'https://painel-robo.juri.capital'];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Prosolutti Api')
    .setDescription('API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, swaggerDocument);

  // Expandir o limite do JSON
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
  app.use(cookieParser());
  setMaxListeners(20);

  const configService = app.get<ConfigService<Env, true>>(ConfigService);
  const port = configService.get('PORT', { infer: true });

  if (process.env?.ENVIRONMENT !== 'production') {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/bull-board');

    const redisClient = app.get('REDIS_CLIENT');

    const insertProcessQueue = new Queue('insert-process-queue', { connection: redisClient });
    const processValidationQueue = new Queue('process-validation-queue', { connection: redisClient });
    const solvencyValidationQueue = new Queue('solvency-validation-queue', { connection: redisClient });
    const extractDocumentQueue = new Queue('extract-document-queue', { connection: redisClient });
    const initialPetitionQueue = new Queue('initial-petition-queue', { connection: redisClient });

    createBullBoard({
      queues: [
        new BullMQAdapter(insertProcessQueue) as BaseAdapter,
        new BullMQAdapter(processValidationQueue) as BaseAdapter,
        new BullMQAdapter(solvencyValidationQueue) as BaseAdapter,
        new BullMQAdapter(extractDocumentQueue) as BaseAdapter,
        new BullMQAdapter(initialPetitionQueue) as BaseAdapter,
      ],
      serverAdapter,
    });

    app.use('/bull-board', serverAdapter.getRouter());
    bootstrapLogger.log(`[BOOT] REDIS_URL: ${process.env.REDIS_URL}`);
    bootstrapLogger.log(
      'Bull Board carregado com as filas: insert-process-queue, process-validation-queue, ' +
      'solvency-validation-queue, extract-document-queue, initial-petition-queue',
    );
    const logger = new Logger('BullBoard');

    logger.warn(
      `Tentando conectar ao Redis para Bull Board... ${process.env.REDIS_URL}`,
    );
    try {
      await insertProcessQueue.getJobCounts();
      logger.warn('Redis conectado com sucesso!');
    } catch (error) {
      logger.error('Falha ao conectar ao Redis:', error);
    }
  }

  const finalPort = port || 8080;
  await app.listen(finalPort, '0.0.0.0');
}
bootstrap();

