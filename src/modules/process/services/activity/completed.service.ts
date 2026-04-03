import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { Process as ProcessEntity } from 'src/modules/process/schema/process.schema';
import { CompletedActivityDTO } from '../../dtos/activity/completed.dto';
import { CreateNotificationsService } from 'src/modules/notification/services/create.service';
import {
  NOTIFICATION_DESCRIPTIONS,
  NOTIFICATION_TITLES,
} from 'src/modules/notification/mocks/notification';
import { NotificationTypeEnum } from 'src/modules/notification/schema/notication.schema';

@Injectable()
export class CompletedActivityService {
  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModel: Model<ProcessEntity>,
    private readonly createNotification: CreateNotificationsService,
  ) {}

  /**
   * Marca uma atividade como concluída
   */
  async execute(processId: string, userId: string, dto: CompletedActivityDTO) {
    // marca a atividade e retorna o processo atualizado
    const updatedProcess = await this.processModel.findOneAndUpdate(
      {
        _id: processId,
        'activities.type': dto.type,
      },
      {
        $set: {
          'activities.$.isCompleted': true,
          'activities.$.completedAt': new Date(),
          'activities.$.completedBy': new mongoose.Types.ObjectId(userId),
          'activities.$.notes': dto.notes ?? null,
          'activities.$.updatedAt': new Date(),
          'activities.$.status': dto.status,
          'activities.$.lossReason': dto.lossReason ?? null,
        },
      },
      {
        new: true, // 👈 retorna o documento atualizado
      },
    );

    if (!updatedProcess) {
      throw new NotFoundException('Processo ou atividade não encontrada.');
    }

    // encontra a atividade atualizada dentro do processo
    const updatedActivity = updatedProcess.activities.find(
      (a) => a.type === dto.type,
    );
    // valida se a atividade existe
    if (!updatedActivity) {
      throw new NotFoundException('Atividade não encontrada no processo.');
    }

    const assignedTo = updatedActivity.assignedTo;
    const assignedBy = updatedActivity.assignedBy;

    // Quem está concluindo a atividade?
    const sendMensageForUserId =
      assignedTo?.toString() === String(userId) ? assignedBy : assignedTo;

    await this.createNotification.execute({
      title: NOTIFICATION_TITLES.ACTIVITY_COMPLETED,
      description:
        `${NOTIFICATION_DESCRIPTIONS.ACTIVITY_COMPLETED}` +
        ` Número do processo: ${updatedProcess.number}.` +
        ` Tipo da atividade: ${dto.type}.`,
      userId: String(sendMensageForUserId),
      type: NotificationTypeEnum.ACTIVITY,
      redirectId: updatedProcess.number,
    });
    return {
      message: 'Atividade concluída com sucesso',
      processId,
      activity: updatedActivity,
    };
  }
}
