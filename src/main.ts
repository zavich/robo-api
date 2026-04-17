// import * as dotenv from 'dotenv';
// Carrega o .env o mais cedo possível (antes do NestFactory.create)
// dotenv.config();

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Logger } from '@nestjs/common';
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

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.setGlobalPrefix('v1');
  patchNestJsSwagger();
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://scraping-api-prd.juri.capital',
      'https://painel-robo-prd.juri.capital',
    ],
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

    const aQueue = new Queue('process-queue', {
      connection: redisClient,
    });

    createBullBoard({
      queues: [new BullMQAdapter(aQueue) as unknown as any], // Força a compatibilidade de tipos
      serverAdapter,
    });

    app.use('/bull-board', serverAdapter.getRouter());
    console.log('[BOOT] REDIS_URL:', process.env.REDIS_URL);
    console.log('✅ Bull Board carregado com a fila process-queue');
    const logger = new Logger('BullBoard');

    logger.warn(
      `Tentando conectar ao Redis para Bull Board... ${process.env.REDIS_URL}`,
    );
    try {
      await aQueue.getJobCounts();
      logger.warn('Redis conectado com sucesso!');
    } catch (error) {
      logger.error('Falha ao conectar ao Redis:', error);
    }
  }

  const finalPort = port || 8080;
  await app.listen(finalPort, '0.0.0.0');
}
bootstrap();
