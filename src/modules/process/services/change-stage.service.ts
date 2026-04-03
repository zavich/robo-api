import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Process, ProcessDocument } from '../schema/process.schema';
import { ProcessDecisions, ProcessDecisionsDocument } from '../schema/process-decisions.schema';
import { User, UserDocument, UserRole } from '../../user/schema/user.schema';
import { ChangeStageDTO } from '../dtos/change-stage.dto';
import { CLASSPROCESS, StageByCode, STAGEPROCESS } from '../interfaces/enum';
import { updateStageToPipedrive } from '../../../service/pipedrive/update-stage';
import { addNoteToPipedrive } from '../../../service/pipedrive/add-note';

@Injectable()
export class ChangeStageService {
  constructor(
    @InjectModel(Process.name)
    private readonly processModel: Model<ProcessDocument>,
    @InjectModel(ProcessDecisions.name)
    private readonly processDecisionModel: Model<ProcessDecisionsDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) { }

  async execute(
    changeStageData: ChangeStageDTO,
    userId: string,
  ) {
    try {
      // 1. Validar se o usuário é admin
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Only admin users can change process stages');
      }

      // 2. Buscar o processo
      const process = await this.processModel.findById(changeStageData.processId);
      if (!process) {
        throw new NotFoundException('Process not found');
      }

      // 3. Verificar se o stage realmente mudou
      if (process.stage === StageByCode[changeStageData.newStageId]) {
        throw new BadRequestException('Process is already in the specified stage');
      }

      const currentStage = process.stage;

      // 4. Atualizar o stage no processo principal
      const updatedProcess = await this.processModel.findByIdAndUpdate(
        changeStageData.processId,
        {
          stage: StageByCode[changeStageData.newStageId],
          stageId: changeStageData.newStageId,
        },
        { new: true }
      );

      // 5. Buscar ou criar registro de decisões do processo
      let processDecision = await this.processDecisionModel.findOne({
        process_id: changeStageData.processId,
      });

      if (!processDecision) {
        processDecision = new this.processDecisionModel({
          process_id: changeStageData.processId,
          history: [],
        });
      }

      // 6. Adicionar entrada no histórico
      const historyEntry = {
        status: process.situation, // Mantém o status atual
        stage: currentStage,
        stage_id: changeStageData.newStageId,
        user_id: new Types.ObjectId(userId),
        rejection_reason: changeStageData.reason || `Stage changed from ${currentStage} to ${StageByCode[changeStageData.newStageId].toString()}`,
        is_custom_reason: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      processDecision.history.push(historyEntry);
      await processDecision.save();

      // 7. Integração com Pipedrive
      await this.updatePipedriveStage(process, changeStageData, StageByCode[changeStageData.newStageId]);

      if (process.class === CLASSPROCESS.MAIN) {
        if (process.calledByProvisionalLawsuitNumber) {
          await this.processModel.findOneAndUpdate(
            {
              number: process.calledByProvisionalLawsuitNumber,
            },
            {
              stageId: changeStageData.newStageId,
              stage: StageByCode[changeStageData.newStageId],
            },
          );
        }
      } else {
        await this.processModel.findOneAndUpdate(
          {
            calledByProvisionalLawsuitNumber: process.number,
          },
          {
            stageId: changeStageData.newStageId,
            stage: StageByCode[changeStageData.newStageId],
          },
        );
      }

      return {
        message: 'Process stage updated successfully',
        process: {
          id: updatedProcess._id,
          number: updatedProcess.number,
          previousStage: currentStage,
          currentStage: updatedProcess.stage,
          stageId: updatedProcess.stageId,
        },
        history: historyEntry,
        pipedrive: {
          updated: process.dealId ? true : false,
          dealId: process.dealId,
        }
      };
    } catch (error) {
      if (error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(`Failed to change process stage: ${error.message}`);
    }
  }

  /**
   * Retorna o stage ID padrão baseado no stage e no contexto do processo
   */
  private getDefaultStageId(stage: STAGEPROCESS, process?: any): number {
    if (process?.dealId) {
      const stageIdMap: Record<STAGEPROCESS, number> = {
        [STAGEPROCESS.PRE_ANALISE]: 802,
        [STAGEPROCESS.ANALISE]: 787,
        [STAGEPROCESS.CALCULO]: 797,
      };
      return stageIdMap[stage] || 802;
    }

    // Para processos sem dealId, usa os códigos padrão
    const defaultStageIdMap: Record<STAGEPROCESS, number> = {
      [STAGEPROCESS.PRE_ANALISE]: 781,
      [STAGEPROCESS.ANALISE]: 769,
      [STAGEPROCESS.CALCULO]: 770,
    };

    return defaultStageIdMap[stage] || 781;
  }

  /**
   * Lista os stages disponíveis
   */
  async getAvailableStages(processId?: string): Promise<{ stages: string[], stageOptions: Array<{ stage: string, defaultId: number, description: string }> }> {
    const stages = Object.values(STAGEPROCESS);

    let process = null;
    if (processId) {
      process = await this.processModel.findById(processId);
    }

    const stageOptions = stages.map(stage => {
      const stageId = this.getDefaultStageId(stage, process);
      const description = this.getStageDescription(stage, stageId);

      return {
        stage,
        defaultId: stageId,
        description,
      };
    });

    return {
      stages,
      stageOptions,
    };
  }

  /**
   * Retorna a descrição do stage baseado no ID
   */
  private getStageDescription(stage: STAGEPROCESS, stageId: number): string {
    const descriptions = {
      781: 'reclamantesOutbound - PRE_ANALISE',
      779: 'reclamantesOutbound - PRE_ANALISE',
      777: 'ticketAuto - PRE_ANALISE',
      802: 'advogadosParceiros - PRE_ANALISE',
      769: 'reclamantesOutbound - ANALISE',
      762: 'reclamantesInbound - ANALISE',
      755: 'ticketAuto - ANALISE',
      787: 'advogadosParceiros - ANALISE',
      770: 'reclamantesOutbound - CALCULO',
      763: 'reclamantesInbound - CALCULO',
      756: 'ticketAuto - CALCULO',
      797: 'advogadosParceiros - CALCULO',
    };

    return descriptions[stageId] || `${stage} - ID: ${stageId}`;
  }

  /**
   * Atualiza o stage no Pipedrive
   */
  private async updatePipedriveStage(
    process: any,
    changeStageData: ChangeStageDTO,
    previousStage: STAGEPROCESS
  ): Promise<void> {
    try {
      // Só atualiza se o processo tem dealId (está integrado com Pipedrive)
      if (!process.dealId) {
        return;
      }

      // 1. Atualizar o stage no Pipedrive
      await updateStageToPipedrive({
        stageId: changeStageData.newStageId,
        dealId: process.dealId,
        status: 'open',
        data: {
          // Dados adicionais podem ser passados aqui se necessário
        }
      });

      // 2. Adicionar uma nota sobre a mudança de stage
      const noteContent = this.buildStageChangeNote({
        processNumber: process.number,
        previousStage,
        newStage: StageByCode[changeStageData.newStageId],
        reason: changeStageData.reason,
        changeDate: new Date(),
      });

      await addNoteToPipedrive({
        content: noteContent,
        dealId: process.dealId,
      });

    } catch (error) {
      // Log do erro mas não falha o processo principal
      console.error('Erro ao atualizar Pipedrive:', error);
      // Opcional: poderia ser melhor usar um logger apropriado
    }
  }

  /**
   * Constrói o conteúdo da nota para o Pipedrive sobre mudança de stage
   */
  private buildStageChangeNote(data: {
    processNumber: string;
    previousStage: STAGEPROCESS;
    newStage: STAGEPROCESS;
    reason?: string;
    changeDate: Date;
  }): string {
    const { processNumber, previousStage, newStage, reason, changeDate } = data;

    return `
      <b>Pro Solutti - Alteração de Stage</b><br/><br/>
      
      <b>Processo:</b> ${processNumber}<br/>
      <b>Stage Anterior:</b> ${this.formatStageForDisplay(previousStage)}<br/>
      <b>Novo Stage:</b> ${this.formatStageForDisplay(newStage)}<br/>
      <b>Data da Alteração:</b> ${changeDate.toLocaleString('pt-BR')}<br/>
      ${reason ? `<b>Motivo:</b> ${reason}<br/>` : ''}
      <br/>
      <i>Alteração realizada automaticamente pelo sistema Pro Solutti.</i>
    `.trim();
  }

  /**
   * Formata o nome do stage para exibição
   */
  private formatStageForDisplay(stage: STAGEPROCESS): string {
    const stageLabels = {
      [STAGEPROCESS.PRE_ANALISE]: 'Pré-Análise',
      [STAGEPROCESS.ANALISE]: 'Análise',
      [STAGEPROCESS.CALCULO]: 'Cálculo',
    };

    return stageLabels[stage] || stage;
  }
}