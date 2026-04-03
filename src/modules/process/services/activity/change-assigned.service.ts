import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { Process as ProcessEntity } from 'src/modules/process/schema/process.schema';
import { CreateActivityDTO } from '../../dtos/activity/create.dto';
import { CreateNotificationsService } from 'src/modules/notification/services/create.service';
import {
  NOTIFICATION_DESCRIPTIONS,
  NOTIFICATION_TITLES,
} from 'src/modules/notification/mocks/notification';
import { NotificationTypeEnum } from 'src/modules/notification/schema/notication.schema';

@Injectable()
export class ChangeAssignedUserService {
  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModel: Model<ProcessEntity>,
    private readonly createNotification: CreateNotificationsService,
  ) {}

  /**
   * Altera o usuário responsável por uma atividade
   */
  async execute(processId: string, dto: CreateActivityDTO) {
    const process = await this.processModel.findById(processId);

    if (!process) {
      throw new NotFoundException('Processo não encontrado');
    }

    // 1. Verifica se a atividade existe
    const activity = process.activities.find((a) => a.type === dto.type);

    if (!activity) {
      throw new BadRequestException(
        `A atividade '${dto.type}' não existe neste processo.`,
      );
    }

    // 2. Impedir que outro usuário tenha alguma atividade
    const userHasActivity = process.activities.some(
      (a) => String(a.assignedTo) === dto.assignedTo,
    );

    if (userHasActivity) {
      throw new BadRequestException(
        'Este usuário já está associado a outra atividade neste processo.',
      );
    }

    if (activity.isCompleted) {
      throw new BadRequestException(
        'Não é possível alterar o responsável de uma atividade já concluída.',
      );
    }
    // 3. Atualiza usando o operador $
    await this.processModel.updateOne(
      {
        _id: processId,
        'activities.type': dto.type,
      },
      {
        $set: {
          'activities.$.assignedTo': new mongoose.Types.ObjectId(
            dto.assignedTo,
          ),
          'activities.$.updatedAt': new Date(),
        },
      },
    );
    await this.createNotification.execute({
      title: NOTIFICATION_TITLES.ACTIVITY_ASSIGNED,
      description:
        `${NOTIFICATION_DESCRIPTIONS.ACTIVITY_ASSIGNED}` +
        ` Número do processo: ${process.number}.` +
        ` Tipo da atividade: ${dto.type}.`,
      userId: String(dto.assignedTo),
      type: NotificationTypeEnum.ACTIVITY,
      redirectId: process.number,
    });
    return {
      message: 'Usuário da atividade atualizado com sucesso',
      processId,
      type: dto.type,
      newAssignedTo: dto.assignedTo,
    };
  }
}
