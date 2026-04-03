import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { Process as ProcessEntity } from 'src/modules/process/schema/process.schema';

import { NotificationTypeEnum } from 'src/modules/notification/schema/notication.schema';
import { CreateNotificationsService } from 'src/modules/notification/services/create.service';
import { CreateActivityDTO } from '../../dtos/activity/create.dto';
import {
  NOTIFICATION_DESCRIPTIONS,
  NOTIFICATION_TITLES,
} from 'src/modules/notification/mocks/notification';
import { User } from 'src/modules/user/schema/user.schema';

@Injectable()
export class CreateActivityService {
  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModule: Model<ProcessEntity>,
    @InjectModel(User.name)
    private readonly userModule: Model<User>,
    private readonly createNotification: CreateNotificationsService,
  ) {}

  /**
   * Cria a atividade dentro do processo
   */
  async execute(assignedBy: string, dto: CreateActivityDTO) {
    const { processes, assignedTo, type } = dto;
    const findUser = await this.userModule.findById(assignedBy);
    if (findUser.role !== 'admin') {
      throw new BadRequestException(
        'Apenas administradores podem criar atividades.',
      );
    }
    if (!processes || processes.length === 0) {
      throw new BadRequestException('Nenhum processo informado.');
    }

    const results = await Promise.all(
      processes.map((processId) =>
        this.createActivityInProcess(processId, assignedTo, assignedBy, type),
      ),
    );

    return {
      message: 'Atividade(s) criada(s) com sucesso',
      results,
    };
  }
  private async createActivityInProcess(
    processId: string,
    assignedTo: string,
    assignedBy: string,
    type: string,
  ) {
    const process = await this.processModule.findById(processId);

    if (!process) {
      throw new NotFoundException(`Processo ${processId} não encontrado`);
    }

    // ---- VALIDAÇÕES ----
    // se já existir atividade deste tipo no processo, retorna sem erro
    if (process.activities.some((a) => a.type === type)) {
      return {
        processId,
        processNumber: process.number,
        skipped: true,
      };
    }

    if (process.activities.some((a) => String(a.assignedTo) === assignedTo)) {
      throw new BadRequestException(
        `O usuário já possui uma atividade neste processo (${process.number}).`,
      );
    }

    // ---- CRIA ATIVIDADE ----
    const activity = {
      type,
      assignedTo: new mongoose.Types.ObjectId(assignedTo),
      assignedBy: new mongoose.Types.ObjectId(assignedBy),
      isCompleted: false,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.processModule.findByIdAndUpdate(processId, {
      $push: { activities: activity },
    });

    // ---- NOTIFICAÇÃO ----
    await this.createNotification.execute({
      title: NOTIFICATION_TITLES.ACTIVITY_ASSIGNED,
      description:
        `${NOTIFICATION_DESCRIPTIONS.ACTIVITY_ASSIGNED}` +
        ` Número do processo: ${process.number}.` +
        ` Tipo da atividade: ${type}.`,
      userId: assignedTo,
      type: NotificationTypeEnum.ACTIVITY,
      redirectId: process.number,
    });

    return {
      processId,
      processNumber: process.number,
      activity,
    };
  }
}
