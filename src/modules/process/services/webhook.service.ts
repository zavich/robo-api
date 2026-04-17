import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { NextStepsService } from 'src/service/next-steps/next-steps.service';
import { VertexAIService } from 'src/service/vertex/vertex-AI.service';
import { AnaliseStatus } from 'src/utils/enum';
import { normalizeString } from 'src/utils/normalize-string';
import { StatusExtractionInsight } from '../enums/status-extraction-insight.enum';
import { Instancia, Root } from '../interfaces/process.interface';
import { execucaoProvisoria } from '../mock/extract';
import { ExtractDocumentsInfoService } from '../queues/process/services/extract-documents-info.service';
import {
  ProcessStatus,
  processStatusName,
} from '../schema/process-status.schema';
import { Process as ProcessEntity, Situation } from '../schema/process.schema';
import { Step } from '../schema/step.schema';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectModel(ProcessEntity.name) private processModel: Model<ProcessEntity>,
    @InjectModel(ProcessStatus.name)
    private readonly processStatusModel: Model<ProcessStatus>,
    @InjectModel(Step.name)
    private readonly stepModel: Model<Step>,
    private readonly nextStepsService: NextStepsService,
    private readonly vertexAIService: VertexAIService,
    private readonly extractDocumentsService: ExtractDocumentsInfoService,
    @InjectQueue('process-queue')
    private readonly processQueue: Queue,
  ) {}

  async execute(body: Root) {
    this.logger.log(`Recebendo requisição de ${body.numero_processo}`);

    try {
      const findProcess = await this.processModel
        .findOne({
          number: body.numero_processo,
        })
        .populate(['processStatus']);
      if (!findProcess) {
        this.logger.error(
          `Processo de número ${body.numero_processo} não encontrado!`,
        );
      } else {
        const step = await this.stepModel.findById(
          (findProcess.processStatus as any).step,
        );
        if (body.status === 'NAO_ENCONTRADO') {
          if (findProcess.sentToRecords === 'SENT') {
            await this.processModel.updateOne(
              {
                _id: findProcess._id,
              },
              {
                sentToRecords: 'NOT_FOUND',
                autosData: null,
              },
            );
            return;
          }

          if (
            findProcess &&
            findProcess.situation === Situation.PENDING &&
            findProcess.class === 'MAIN' &&
            findProcess?.calledByProvisionalLawsuitNumber
          ) {
            const findLawsuitProvisional: any = await this.processModel
              .findOne({
                number: findProcess.calledByProvisionalLawsuitNumber,
              })
              .populate({
                path: 'processStatus',
                populate: ['step'],
              });

            if (
              findLawsuitProvisional &&
              findLawsuitProvisional?.processStatus
            ) {
              await this.nextStepsService.execute(
                findLawsuitProvisional?.processStatus?.step.slug,
                {
                  processNumber: findLawsuitProvisional?.number,
                },
              );
            }
          }

          // await this.processModel.findByIdAndUpdate(findProcess._id, {
          //   situation: Situation.ISSUED,
          // });

          if (findProcess?.processMain) {
            const mainProcess: any = await this.processModel
              .findOne({
                _id: findProcess.processMain,
              })
              .populate({
                path: 'processStatus',
                populate: ['step'],
              });

            if (mainProcess?.processStatus?.step.slug === 'step-3') {
              this.nextStepsService.execute(
                mainProcess?.processStatus?.step.slug,
                {
                  processNumber: mainProcess.number,
                },
              );
              console.log(
                'Processo provisorio não encontrado, seguindo com principal',
              );
            }
            return;
          }

          return await this.processStatusModel.findByIdAndUpdate(
            findProcess.processStatus._id,
            {
              name: 'Error',
              log: body.resposta.message,
              errorReason: body.resposta.message,
            },
          );
        } else if (body.status === 'ERRO') {
          // await this.processModel.findByIdAndUpdate(findProcess._id, {
          //   situation: Situation.ISSUED,
          // });
          return await this.processStatusModel.findByIdAndUpdate(
            findProcess.processStatus,
            {
              name: processStatusName.Rejected,
              log: '',
              errorReason: AnaliseStatus.TRT_INACESSIVEL,
            },
          );
        } else {
          const origem = body.tribunal.sigla.toLowerCase();
          if (origem.includes('tst')) {
            const oldMoviments = {
              tst:
                findProcess?.instanciasAutos[0]?.movimentacoes?.length === 0
                  ? body.resposta?.instancias?.find(
                      (instancia) => instancia.instancia === 'TST',
                    )?.movimentacoes?.length
                  : findProcess?.instanciasAutos[0]?.movimentacoes?.length,
            };
            await this.processModel.updateOne(
              {
                _id: findProcess._id,
              },
              {
                sentToRecords: 'FOUND',
                instanciasAutos: body?.resposta?.instancias,
                oldMoviments,
              },
            );
            return this.extractRecordData(
              body.numero_processo,
              body?.resposta?.instancias[0],
            );
          } else if (origem.includes('trt')) {
            const oldMoviments = {
              primeiroGrau:
                findProcess?.instancias?.find(
                  (instancia) => instancia?.instancia === 'PRIMEIRO_GRAU',
                )?.movimentacoes?.length === 0
                  ? body.resposta?.instancias?.find(
                      (instancia) => instancia.instancia === 'PRIMEIRO_GRAU',
                    )?.movimentacoes?.length
                  : findProcess?.instancias?.find(
                      (instancia) => instancia.instancia === 'PRIMEIRO_GRAU',
                    )?.movimentacoes?.length,
              segundoGrau:
                findProcess?.instancias?.find(
                  (instancia) => instancia.instancia === 'SEGUNDO_GRAU',
                )?.movimentacoes?.length === 0
                  ? body.resposta?.instancias?.find(
                      (instancia) => instancia.instancia === 'SEGUNDO_GRAU',
                    )?.movimentacoes?.length
                  : findProcess?.instancias?.find(
                      (instancia) => instancia.instancia === 'SEGUNDO_GRAU',
                    )?.movimentacoes?.length,
            };
            console.log('Old moviments:', oldMoviments);

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
            if (!body?.opcoes?.autos) {
              await this.processModel.findByIdAndUpdate(findProcess._id, {
                instancias: body?.resposta?.instancias,
                origem: body?.resposta?.origem,
                valueCase: body?.resposta?.instancias[0]?.valor_causa,
                processParts: body?.resposta?.instancias?.find(
                  (instancia) => instancia.instancia === 'PRIMEIRO_GRAU',
                ).partes,
                oldMoviments: oldMoviments,
                class: definedClass,
                moviments: moviments,
              });
              // verfifica se existe a ultima validação não da next step.
              this.logger.log('Next step:', step.slug);
              this.logger.log('Body:', body.numero_processo);
              this.nextStepsService.execute(step.slug, {
                processNumber: body.numero_processo,
              });
            } else {
              console.log('Processo com autos encontrado');

              const docs = body.resposta?.instancias[0].documentos;

              if (docs?.length) {
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
                  moviments: moviments,
                });
                if (findProcess.class === 'MAIN') {
                  const provisionFound = await this.processModel.findOne({
                    number: findProcess.calledByProvisionalLawsuitNumber,
                  });

                  if (provisionFound) {
                    console.log(
                      `Processo de execução provisória encontrado na base para processo principal ${findProcess.number}`,
                    );
                    this.nextStepsService.execute(step.slug, body);
                    return;
                  }
                }

                if (findProcess.processMain) {
                  // Extract documents from provisional execution process
                  await this.extractDocumentsService.execute(
                    findProcess.number,
                  );
                  const mainProcess: any = await this.processModel
                    .findOne({
                      _id: findProcess.processMain,
                    })
                    .populate({
                      path: 'processStatus',
                      populate: ['step'],
                    });

                  if (mainProcess) {
                    if (mainProcess?.processStatus?.step.slug === 'step-3') {
                      this.nextStepsService.execute(
                        mainProcess?.processStatus?.step.slug,
                        {
                          processNumber: mainProcess.number,
                        },
                      );
                    } else {
                      this.nextStepsService.execute(step.slug, {
                        processNumber: findProcess.number,
                      });
                    }
                    return;
                  }
                }
                console.log(
                  `Seguindo com processo ${body?.resposta?.numero_unico}`,
                );
                this.nextStepsService.execute(step.slug, body);
              }
            }
          }
        }
      }
    } catch (error) {
      console.log('error', error);
      this.logger.error(`Erro ao processar a requisição: ${error.message}`);
    }
  }

  async extractRecordData(processNumber: string, instancias: Instancia) {
    try {
      const orgaoJulgador = instancias.orgao_julgador ?? null;
      const relator = instancias?.pessoa_relator ?? null;
      const partes = instancias.partes ?? [];

      const partesAtivas = partes
        ?.filter((parte) =>
          ['embargante', 'requerente', 'agravante', 'recorrente', 'autor'].some(
            (tipo) => normalizeString(parte?.tipo)?.includes(tipo),
          ),
        )
        ?.map((parte) => parte.nome);

      const partesPassivas = partes
        ?.filter((parte) =>
          ['embargado', 'agravado', 'requerido', 'recorrido', 'reu'].some(
            (tipo) => normalizeString(parte?.tipo)?.includes(tipo),
          ),
        )
        ?.map((parte) => parte.nome);

      const ativo = partesAtivas.length > 0 ? partesAtivas.join(', ') : null;
      const passivo =
        partesPassivas.length > 0 ? partesPassivas.join(', ') : null;

      const dataTransito =
        instancias?.movimentacoes
          ?.find((movimento) =>
            ['transitado em julgado']?.some((term) =>
              movimento.conteudo
                ?.normalize('NFD')
                ?.replace(/[0-\u036f]/g, '')
                ?.toLocaleLowerCase()
                ?.includes(term),
            ),
          )
          ?.conteudo?.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? null;
      const dataDistribuicao =
        instancias?.movimentacoes?.find((movimento) =>
          ['distribuído por sorteio', 'sorteio']?.some((term) =>
            movimento.conteudo
              ?.normalize('NFD')
              ?.replace(/[0-\u036f]/g, '')
              ?.toLocaleLowerCase()
              ?.includes(term),
          ),
        )?.data ?? null;

      const movimentacoes = instancias?.movimentacoes ?? null;

      /* TODO: Alterar campos appellant e appellee para ativo e passivo */
      const autosData = {
        class: orgaoJulgador,
        relator,
        ativo,
        passivo,
        dateOfTransit: dataTransito,
        dateOfDistribution: dataDistribuicao,
        movements: movimentacoes,
      };

      await this.processModel.updateOne(
        { number: processNumber },
        { autosData },
      );
      this.logger.log('Finished extracting record data');
    } catch (error) {
      this.logger.error(`Erro ao extrair dados do processo: ${error.message}`);
    }
  }

  isProvisionalExecution(classProcess: string): boolean {
    return execucaoProvisoria.some((execucao) =>
      execucao
        .normalize('NFD')
        .replace(/[0-\u036f]/g, '')
        .toLowerCase()
        .includes(
          classProcess
            ?.normalize('NFD')
            .replace(/[0-\u036f]/g, '')
            .toLowerCase(),
        ),
    );
  }
}
