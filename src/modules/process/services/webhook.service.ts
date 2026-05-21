import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Redis from 'ioredis';
import { Model, Types } from 'mongoose';
import { Root } from '../interfaces/process.interface';
import { ProcessStatus } from '../schema/process-status.schema';
import { Process as ProcessEntity } from '../schema/process.schema';
import { Step } from '../schema/step.schema';
import { WebhookErroHandler } from './handlers/webhook-erro.handler';
import { WebhookNaoEncontradoHandler } from './handlers/webhook-nao-encontrado.handler';
import { WebhookTrtHandler } from './handlers/webhook-trt.handler';
import { WebhookTstHandler } from './handlers/webhook-tst.handler';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModel: Model<ProcessEntity>,
    @InjectModel(Step.name)
    private readonly stepModel: Model<Step>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
    private readonly naoEncontradoHandler: WebhookNaoEncontradoHandler,
    private readonly erroHandler: WebhookErroHandler,
    private readonly tstHandler: WebhookTstHandler,
    private readonly trtHandler: WebhookTrtHandler,
  ) {}

  async execute(body: Root, correlationId?: string) {
    this.logger.log(
      `Recebendo webhook de ${body.numero_processo} (correlationId=${correlationId ?? 'n/a'})`,
    );

    const idempotencyKey = this.buildIdempotencyKey(body);
    const alreadyProcessing = await this.redis.set(
      idempotencyKey,
      'PROCESSING',
      'EX',
      60 * 60 * 24,
      'NX',
    );
    if (!alreadyProcessing) {
      const currentState = await this.redis.get(idempotencyKey);
      this.logger.warn(
        `Webhook duplicado ignorado para ${body.numero_processo} (status: ${body.status}, key=${idempotencyKey}, state=${currentState ?? 'unknown'})`,
      );
      return;
    }

    try {
      const findProcess = await this.processModel
        .findOne({ number: body.numero_processo })
        .populate(['processStatus']);

      if (!findProcess) {
        this.logger.error(
          `Processo de número ${body.numero_processo} não encontrado!`,
        );
        await this.redis
          .set(idempotencyKey, 'FAILED_PROCESS_NOT_FOUND', 'EX', 5 * 60)
          .catch(() => undefined);
        return;
      }

      const step = await this.stepModel.findById(
        (findProcess.processStatus as any).step,
      );

      if (body.status === 'NAO_ENCONTRADO') {
        await this.naoEncontradoHandler.handle(
          body,
          findProcess as unknown as ProcessEntity & {
            _id: string;
            processStatus: { _id: string };
          },
          step,
          correlationId,
        );
      } else if (body.status === 'ERRO') {
        await this.erroHandler.handle(
          body,
          findProcess as unknown as ProcessEntity & {
            _id: string;
            processStatus: { _id: string };
          },
          correlationId,
        );
      } else {
        const origem = body.tribunal.sigla.toLowerCase();
        if (origem.includes('tst')) {
          await this.tstHandler.handle(
            body,
            findProcess as unknown as ProcessEntity & { _id: string },
          );
        } else if (origem.includes('trt')) {
          await this.trtHandler.handle(
            body,
            findProcess as unknown as ProcessEntity & {
              _id: Types.ObjectId;
              processStatus: { _id: string };
            },
            step,
            correlationId,
          );
        }
      }

      await this.redis.set(idempotencyKey, 'DONE', 'EX', 60 * 60 * 24);
    } catch (error) {
      this.logger.error(`Erro ao processar a requisição: ${error.message}`);
      await this.redis.set(idempotencyKey, 'FAILED', 'EX', 60 * 60).catch(() => undefined);
      throw error;
    }
  }

  private buildIdempotencyKey(body: Root): string {
    if (!body.webhookId) {
      throw new BadRequestException(
        `Webhook ${body.numero_processo} chegou sem webhookId`,
      );
    }

    return `webhook:${body.webhookId}`;
  }
}
