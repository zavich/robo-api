import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Process } from '../schema/process.schema';
import { Model } from 'mongoose';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import axios from 'axios';
import { CreateProcessService } from './create-process.service';
import { CLASSPROCESS } from '../interfaces/enum';
import { updatePipedriveCustomField } from 'src/service/pipedrive/update-custom-field';

@Injectable()
export class InsertExecutionService {
  constructor(
    @InjectModel(Process.name)
    private readonly lawsuitModel: Model<Process>,
    @InjectQueue('process-queue') private readonly processQueue: Queue,
    private readonly createProcessService: CreateProcessService,
  ) {}

  async execute(id: string, lawsuitExecution: string, pipedriveFieldValue?: string) {
    try {
      if (!id) {
        throw new BadRequestException('ID do processo é obrigatório');
      }

      const regionTRT = Number(lawsuitExecution.split('.')[3]);
      const findLawsuit = await this.lawsuitModel.findById(id);

      if (!findLawsuit) {
        throw new BadRequestException('Processo principal não encontrado');
      }

      const findExecutionProcess = await this.lawsuitModel.findOne({
        number: lawsuitExecution,
      });

      if (
        findExecutionProcess &&
        findExecutionProcess.class === CLASSPROCESS.MAIN
      ) {
        throw new BadRequestException(
          'O número do processo de execução não pode ser um processo principal.',
        );
      }
      // Se o processo de execução não existe, criar através do CreateProcessService
      if (!findExecutionProcess) {
        try {
          const createResult = await this.createProcessService.execute({
            processes: [lawsuitExecution],
          });

          // Se houve erro na fila mas processo foi identificado, ainda aguarda
          if (createResult.queueError) {
            console.warn(
              `[InsertExecutionService] Queue error occurred but process creation initiated`,
            );
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (createError: any) {
          console.error(
            `[InsertExecutionService] Error creating execution process:`,
            {
              message: createError.message,
              name: createError.name,
              isRedisError:
                createError.message?.includes('redis') ||
                createError.message?.includes('Redis'),
            },
          );
          // Continua mesmo se houver erro na criação, pois pode ser que o processo já esteja sendo processado
          console.log(
            `[InsertExecutionService] Continuing despite creation error - process may be in queue or Redis unavailable`,
          );
        }
      }

      await this.lawsuitModel.findByIdAndUpdate(id, {
        $set: {
          calledByProvisionalLawsuitNumber: lawsuitExecution,
        },
      });

      // Atualizar campo customizado no Pipedrive se fornecido
      let pipedriveUpdateResult = null;
      if (pipedriveFieldValue && findLawsuit.dealId) {
        try {
          pipedriveUpdateResult = await updatePipedriveCustomField({
            dealId: findLawsuit.dealId,
            fieldKey: 'fc5f94cbf972eacef5050f1f53b4f88f1770f87c',
            fieldValue: pipedriveFieldValue,
          });
        } catch (pipedriveError: any) {
          console.error('[InsertExecutionService] Erro ao atualizar Pipedrive:', {
            dealId: findLawsuit.dealId,
            fieldValue: pipedriveFieldValue,
            error: pipedriveError.message,
          });
          // Não falha a operação principal se o Pipedrive falhar
        }
      }

      return {
        message: 'Processo de execução vinculado com sucesso.',
        processId: id,
        executionNumber: lawsuitExecution,
        trtRegion: regionTRT,
        executionProcessExists: !!findExecutionProcess,
        pipedriveUpdated: !!pipedriveUpdateResult,
        pipedriveFieldValue: pipedriveFieldValue || null,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          // Erro da API (ex: 404, 500)
          throw new BadRequestException({
            message: 'Erro na consulta do processo no PJe',
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
            url: error.config?.url,
          });
        } else if (error.request) {
          // Requisição enviada mas sem resposta
          throw new BadRequestException({
            message:
              'Sem resposta do servidor PJe - Timeout ou servidor indisponível',
            code: error.code,
            url: error.config?.url,
          });
        } else {
          // Algo antes de enviar a requisição
          throw new BadRequestException({
            message: 'Erro na configuração da requisição para o PJe',
            error: error.message,
          });
        }
      }

      // Se não for AxiosError, relança normal
      console.error(`[InsertExecutionService] Non-Axios error:`, {
        message: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}
