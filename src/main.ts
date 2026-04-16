import * as dotenv from 'dotenv';
// Carrega o .env o mais cedo possível (antes do NestFactory.create)
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Env } from './config/zod/env';
import * as bodyParser from 'body-parser';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bull';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { patchNestJsSwagger } from 'nestjs-zod';
import * as cookieParser from 'cookie-parser';
import { setMaxListeners } from 'events';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Adicionando exceção para a rota 'health'
  app.getHttpAdapter().get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Mantendo o prefixo global 'v1'
  app.setGlobalPrefix('v1');
  patchNestJsSwagger();
  app.enableCors({
    origin: [
      'https://scraping-api-prd.juri.capital',
      'https://painel-robo-prd.juri.capital',
    ],
    credentials: true, // Permite o envio de cookies
  });
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Prosolutti Api')
    .setDescription('API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, swaggerDocument);
  //expandir o limite do json
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
  app.use(cookieParser());
  setMaxListeners(20);
  const configService = app.get<ConfigService<Env, true>>(ConfigService);
  const port = configService.get('PORT', { infer: true });

  if (process.env?.ENVIRONMENT !== 'production') {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/bull-board');
    const aQueue = app.get<Queue>(`BullQueue_process-queue`);
    createBullBoard({
      queues: [new BullAdapter(aQueue)],
      serverAdapter,
    });
    app.use('/bull-board', serverAdapter.getRouter());
  }

  const finalPort = port || 8080;
  await app.listen(finalPort, '0.0.0.0');
}
bootstrap();
