import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import axios, { AxiosError } from 'axios';
import { Model } from 'mongoose';
import { normalize } from 'path';
import {
  classesAprovar,
  execucaoProvisoria,
} from 'src/modules/process/mock/extract';
import { ProcessStatus } from 'src/modules/process/schema/process-status.schema';
import { Step } from 'src/modules/process/schema/step.schema';
import { NextStepsService } from 'src/service/next-steps/next-steps.service';
import { normalizeString } from 'src/utils/normalize-string';
import { Process as ProcessEntity } from '../../../schema/process.schema';

@Injectable()
export class ProcessValidationService {
  private readonly logger = new Logger();
  constructor(
    @InjectModel(ProcessStatus.name)
    private readonly processStatusModule: Model<ProcessStatus>,
    @InjectModel(Step.name) private readonly stepModule: Model<Step>,
    @InjectModel(ProcessEntity.name)
    private readonly processModule: Model<ProcessEntity>,
    private readonly nextStepsService: NextStepsService,
  ) {}

  async execute(number) {
    try {
      const match = number.match(/^\d{7}-\d{2}\.\d{4}\.\d\.(\d{2})\.\d{4}$/);
      const regionTRT = match ? Number(match[1]) : null;
      const url = process.env.SCRAPING_BASE_URL;
      const step = await this.stepModule.findOne({
        slug: 'step-1',
      });
      const processData = await this.processModule
        .findOne({
          number,
        })
        .populate(['processStatus']);
      const processId = processData._id;

      if (this.wasSentToRecords(processData)) {
        await this.processModule.findByIdAndUpdate(processId, {
          sentToRecords: 'SENT',
        });
        this.logger.log('Processo foi enviado para o TST.');
        try {
          await axios.post(`${url}/processos/${number}`, {
            origem: 'TST',
          });
        } catch (error) {
          const AxiosError = error as AxiosError;
          if (AxiosError.response?.status === 402) {
            this.logger.error('Error sending process to TST', error);
          }
        }
      }
      await this.processModule.findByIdAndUpdate(
        processId,
        {
          class: this.isProvisionalExecution(
            processData?.instancias?.find(
              (instancia) => instancia.instancia === 'PRIMEIRO_GRAU',
            )?.classe,
          )
            ? 'PROVISIONAL_EXECUTION'
            : 'MAIN',
        },
        { new: true },
      );
      this.logger.log('PROCESS VALIDATION FINISHED!');

      await this.createOrUpdateProcessStatus(step, processData);

      await this.nextStepsService.execute(step.next, {
        processNumber: number,
      });
    } catch (error) {
      console.log('Error validar processo!', error);
      this.logger.error('Error validar processo!', error);
    }
  }
  findHomologationMovements(movimentacoes) {
    const regexHomologacao = /homologad[oa].*?(acordo|transacao)/i;

    return movimentacoes.filter((mov) =>
      regexHomologacao.test(normalize(mov.conteudo)),
    );
  }

  private async createOrUpdateProcessStatus(step: any, process: any) {
    const findNextStep = await this.stepModule.findOne({ slug: step.next });

    return await this.processStatusModule.findByIdAndUpdate(
      process?.processStatus?._id,
      {
        step: findNextStep?._id,
      },
    );
  }

  // Verifica se o processo é Execução provisória ou principal
  isProvisionalExecution(classProcess: string): boolean {
    return execucaoProvisoria.some((execucao) =>
      execucao
        .normalize('NFD') // Normaliza para decompor caracteres
        .replace(/[\u0300-\u036f]/g, '') // Remove acentuação
        .toLowerCase()
        .includes(
          classProcess
            ?.normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase(),
        ),
    );
  }

  executionIsExtinct(process: any): boolean {
    const instances = process?.instancias || [];
    const hasExtinctExecution = instances.some((instance: any) =>
      instance?.movimentacoes?.some((movement: any) =>
        ['extinta a execu\u00e7\u00e3o', 'o cumprimento da senten\u00e7a'].some(
          (term) =>
            movement?.conteudo
              ?.normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase()
              .includes(
                term
                  ?.normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .toLowerCase(),
              ),
        ),
      ),
    );
    return hasExtinctExecution;
  }

  wasSentToRecords(process): { instance: any; movements: any[] }[] {
    const instances = process?.instancias || [];
    const instancesWithMovements = instances
      .map((instance: any) => {
        const movements = instance?.movimentacoes?.filter((movement: any) =>
          movement?.conteudo?.includes(
            'Remetidos os autos para Tribunal Superior do Trabalho para processar recurso',
          ),
        );
        return movements?.length > 0 ? { instance, movements } : null;
      })
      .filter((instance: any) => instance !== null);
    return instancesWithMovements;
  }

  // Verifica se o processo é trabalhista
  isLaborProcess(process: any): boolean {
    const subject = process?.instancias?.find(
      (instancia) => instancia.instancia === 'PRIMEIRO_GRAU',
    )?.area;
    return subject?.toLowerCase().includes('trabalhista');
  }

  // Verifica se o processo está em segredo de justiça
  isUnderSecrecy(process: any): boolean {
    const instances = process?.instancias || [];
    const hasSecrecy = instances.every(
      (instance: any) => instance?.segredo === true,
    );
    return hasSecrecy;
  }

  // Verifica se o processo está ativo

  isProcessArchived(process: any): boolean {
    return (
      process?.instancias.find(
        (instancia) => instancia.instancia === 'PRIMEIRO_GRAU',
      ).arquivado === true
    );
  }
  // Verifica se o processo é procedente
  isProcedentProcess(process: any): boolean {
    const authorKeywords = [
      'autor',
      'reclamante',
      'requerente',
      'polo ativo',
      'exequente',
    ];
    const autor = process.instancias
      ?.find((instancia) => instancia.instancia === 'PRIMEIRO_GRAU')
      ?.partes?.find(
        (item) =>
          authorKeywords.some((keyword) =>
            item.tipo?.toLowerCase().includes(keyword),
          ) && item.principal,
      );
    const authorName = normalizeString(autor?.nome) // remove pontuação
      ?.trim();

    const firstDegreeInstance = process?.instancias?.find(
      (instancia) => instancia?.instancia === 'PRIMEIRO_GRAU',
    );

    const secondDegreeInstance = process?.instancias?.find(
      (instancia) => instancia?.instancia === 'SEGUNDO_GRAU',
    );

    // Verifique se as instâncias existem antes de acessar suas movimentações
    const movementsFirst = firstDegreeInstance?.movimentacoes || [];
    const movementsSecond = secondDegreeInstance?.movimentacoes || [];

    // Verifica se há movimentação de 1º grau indicando improcedência
    const firstDegreeRegex =
      /julgado(?:\(s\))?\s+improcedente(?:\(s\))?\s+o(?:\(s\))?\s+pedido(?:\(s\))?/i;

    const isFirstDegreeImprocedent = movementsFirst.some((movement: any) =>
      firstDegreeRegex.test(movement?.conteudo || ''),
    );

    const isSecondDegreeImprocedent = movementsSecond.some((movement: any) => {
      if (!authorName) return false;

      const content = normalizeString(movement?.conteudo || '');
      return content.match(
        new RegExp(`.*conhecido.*recurso.*${authorName}.*nao.*provido.*`, 'i'),
      );
    });

    // O processo é considerado improcedente se ambas as condições forem verdadeiras
    return isFirstDegreeImprocedent && isSecondDegreeImprocedent;
  }

  // Verifica se a classe é aprovada (exemplo baseado em uma lista de classes aprovadas)
  isClassApproved(process: any): boolean {
    const processClass = process?.instancias?.find(
      (instancia) => instancia.instancia === 'PRIMEIRO_GRAU',
    ).classe;

    return classesAprovar.some((approvedClass) =>
      processClass?.includes(approvedClass),
    );
  }
}
