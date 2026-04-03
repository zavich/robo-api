import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Process as ProcessEntity } from 'src/modules/process/schema/process.schema';
import { UpdateActivityNotesDTO } from '../../dtos/activity/update-notes.dto';

@Injectable()
export class UpdateActivityNotesService {
  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModel: Model<ProcessEntity>,
  ) {}

  /**
   * Atualiza as notas de uma atividade
   */
  async execute(processId: string, dto: UpdateActivityNotesDTO) {
    const process = await this.processModel.findById(processId);

    if (!process) {
      throw new NotFoundException('Processo não encontrado');
    }

    // Verifica se a atividade existe
    const activity = process.activities.find((a) => a.type === dto.type);

    if (!activity) {
      throw new NotFoundException(
        `A atividade '${dto.type}' não existe neste processo.`,
      );
    }

    // Atualiza as notas da atividade
    const updatedProcess = await this.processModel.findOneAndUpdate(
      {
        _id: processId,
        'activities.type': dto.type,
      },
      {
        $set: {
          'activities.$.notes': dto.notes ?? null,
          'activities.$.updatedAt': new Date(),
        },
      },
      {
        new: true, // Retorna o documento atualizado
      },
    );

    if (!updatedProcess) {
      throw new NotFoundException('Processo ou atividade não encontrada.');
    }

    // Encontra a atividade atualizada dentro do processo
    const updatedActivity = updatedProcess.activities.find(
      (a) => a.type === dto.type,
    );
    return {
      message: 'Notas da atividade atualizadas com sucesso',
      processId,
      activity: updatedActivity,
    };
  }
}
