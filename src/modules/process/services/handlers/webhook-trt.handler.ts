import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import { NextStepsService } from 'src/service/next-steps/next-steps.service';
import { StatusExtractionInsight } from '../../enums/status-extraction-insight.enum';
import { Movimentacoes, Root } from '../../interfaces/process.interface';
import { execucaoProvisoria } from '../../mock/extract';
import { ExtractDocumentsInfoService } from '../../queues/process/services/extract-documents-info.service';
import { Process as ProcessEntity } from '../../schema/process.schema';
import { Step } from '../../schema/step.schema';

interface OldMoviments {
  primeiroGrau: number | undefined;
  segundoGrau: number | undefined;
}

type MovimentWithInstancia = Movimentacoes & { instancia: string };

@Injectable()
export class WebhookTrtHandler {
  private readonly logger = new Logger(WebhookTrtHandler.name);

  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModel: Model<ProcessEntity>,
    private readonly nextStepsService: NextStepsService,
    private readonly extractDocumentsService: ExtractDocumentsInfoService,
  ) {}

  async handle(
    body: Root,
    findProcess: ProcessEntity & { _id: Types.ObjectId; processStatus: { _id: string } },
    step: Step,
    correlationId?: string,
  ): Promise<void> {
    const oldMoviments = {
      primeiroGrau:
        (findProcess?.instancias?.find(
          (instancia) => instancia?.instancia === 'PRIMEIRO_GRAU',
        )?.movimentacoes as Record<string, unknown>[] | undefined)?.length === 0
          ? body.resposta?.instancias?.find(
              (instancia) => instancia.instancia === 'PRIMEIRO_GRAU',
            )?.movimentacoes?.length
          : (findProcess?.instancias?.find(
              (instancia) => instancia.instancia === 'PRIMEIRO_GRAU',
            )?.movimentacoes as Record<string, unknown>[] | undefined)?.length,
      segundoGrau:
        (findProcess?.instancias?.find(
          (instancia) => instancia.instancia === 'SEGUNDO_GRAU',
        )?.movimentacoes as Record<string, unknown>[] | undefined)?.length === 0
          ? body.resposta?.instancias?.find(
              (instancia) => instancia.instancia === 'SEGUNDO_GRAU',
            )?.movimentacoes?.length
          : (findProcess?.instancias?.find(
              (instancia) => instancia.instancia === 'SEGUNDO_GRAU',
            )?.movimentacoes as Record<string, unknown>[] | undefined)?.length,
    };
    this.logger.log(`Old moviments: ${JSON.stringify(oldMoviments)}`);

    const definedClass = this.isProvisionalExecution(
      body.resposta?.instancias?.find(
        (instancia) => instancia.instancia === 'PRIMEIRO_GRAU',
      )?.classe,
    )
      ? 'PROVISIONAL_EXECUTION'
      : 'MAIN';

    const moviments =
      body?.resposta?.instancias?.flatMap((instancia) =>
        instancia.movimentacoes.map((moviment) => ({
          ...moviment,
          instancia: instancia.instancia,
        })),
      ) || [];

    if (!(body?.opcoes as Record<string, unknown> | undefined)?.autos) {
      await this.handleWithoutAutos(
        body,
        findProcess,
        step,
        oldMoviments,
        definedClass,
        moviments,
        correlationId,
      );
    } else {
      await this.handleWithAutos(
        body,
        findProcess,
        step,
        definedClass,
        moviments,
        correlationId,
      );
    }
  }

  private async handleWithoutAutos(
    body: Root,
    findProcess: ProcessEntity & { _id: Types.ObjectId },
    step: Step,
    oldMoviments: OldMoviments,
    definedClass: string,
    moviments: MovimentWithInstancia[],
    correlationId?: string,
  ): Promise<void> {
    await this.processModel.findByIdAndUpdate(findProcess._id, {
      instancias: body?.resposta?.instancias,
      origem: body?.resposta?.origem,
      valueCase: body?.resposta?.instancias[0]?.valor_causa,
      processParts: body?.resposta?.instancias?.find(
        (instancia) => instancia.instancia === 'PRIMEIRO_GRAU',
      )?.partes,
      oldMoviments,
      class: definedClass,
      moviments,
    });
    this.logger.log(`Next step: ${step.slug}`);
    this.logger.log(`Body: ${body.numero_processo}`);
    await this.nextStepsService.execute(step.slug, {
      processNumber: body.numero_processo,
      correlationId,
    });
  }

  private async handleWithAutos(
    body: Root,
    findProcess: ProcessEntity & { _id: Types.ObjectId; processStatus: { _id: string } },
    step: Step,
    definedClass: string,
    moviments: MovimentWithInstancia[],
    correlationId?: string,
  ): Promise<void> {
    this.logger.log('Processo com autos encontrado');
    const docs = body.resposta?.instancias[0].documentos;

    if (!docs?.length) return;

    const docsWithStatus = docs.map((doc) => ({
      ...doc,
      status: StatusExtractionInsight.PENDING,
    }));

    await this.processModel.findByIdAndUpdate(findProcess._id, {
      origem: body?.resposta?.origem,
      instanciasAutosWithDocs: body?.resposta?.instancias,
      valueCase: body?.resposta?.instancias[0]?.valor_causa,
      documents: docsWithStatus,
      class: definedClass,
      moviments,
    });

    if (findProcess.class === 'MAIN') {
      const provisionFound = await this.processModel.findOne({
        number: findProcess.calledByProvisionalLawsuitNumber,
      });

      if (provisionFound) {
        this.logger.log(
          `Processo de execução provisória encontrado na base para processo principal ${findProcess.number}`,
        );
        await this.nextStepsService.execute(step.slug, {
          ...body,
          correlationId,
        });
        return;
      }
    }

    if (findProcess.processMain) {
      await this.extractDocumentsService.execute(findProcess.number);
      const mainProcess = await this.processModel
        .findOne({ _id: findProcess.processMain })
        .populate({ path: 'processStatus', populate: ['step'] });

      if (mainProcess) {
        const populatedMainProcess = mainProcess as HydratedDocument<ProcessEntity> & { processStatus: { step: { slug: string } } };
        if (populatedMainProcess?.processStatus?.step.slug === 'step-3') {
          await this.nextStepsService.execute(
            populatedMainProcess.processStatus.step.slug,
            { processNumber: mainProcess.number, correlationId },
          );
        } else {
          await this.nextStepsService.execute(step.slug, {
            processNumber: findProcess.number,
            correlationId,
          });
        }
        return;
      }
    }

    this.logger.log(
      `Seguindo com processo ${body?.resposta?.numero_unico}`,
    );
    await this.nextStepsService.execute(step.slug, {
      ...body,
      correlationId,
    });
  }

  isProvisionalExecution(classProcess?: string): boolean {
    if (!classProcess) return false;

    const normalizedClass = classProcess
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    // Verifica se a CLASSE DO PROCESSO contém o termo-base (não o contrário):
    // classProcess costuma ser mais descritivo que os termos de execucaoProvisoria.
    return execucaoProvisoria.some((execucao) =>
      normalizedClass.includes(
        execucao
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase(),
      ),
    );
  }
}
