import * as dotenv from 'dotenv';
// Carrega o .env o mais cedo possível (antes do NestFactory.create)
dotenv.config();

import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import { Queue } from 'bull';
import * as cookieParser from 'cookie-parser';
import { setMaxListeners } from 'events';
import { patchNestJsSwagger } from 'nestjs-zod';
import { AppModule } from './app.module';
import { Env } from './config/zod/env';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
