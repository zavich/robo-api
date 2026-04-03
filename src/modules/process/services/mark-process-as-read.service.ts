import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Process } from '../schema/process.schema';

@Injectable()
export class MarkProcessAsReadService {
  private readonly logger = new Logger(MarkProcessAsReadService.name);

  constructor(
    @InjectModel(Process.name)
    private readonly processModel: Model<Process>,
  ) {}

  async execute(processId: string, userId: string) {
    if (!userId) throw new BadRequestException('userId obrigatório');

    const process = await this.processModel.findById(processId);
    if (!process) throw new NotFoundException('Processo não encontrado');

    // Remover o usuário da lista de não lidos
    const updatedProcess = await this.processModel.findByIdAndUpdate(
      processId,
      {
        $pull: { unreadByUsers: userId },
      },
      {
        new: true,
        runValidators: false,
      },
    );

    // Se não há mais usuários não lidos, resetar a flag hasNewMovements
    // if (updatedProcess && updatedProcess.unreadByUsers && updatedProcess.unreadByUsers.length === 0) {
    await this.processModel.findByIdAndUpdate(
      processId,
      {
        $set: { hasNewMovements: false },
      },
      { new: true },
    );
    this.logger.log(
      `Flag hasNewMovements resetada para processo ${processId} - todos os usuários leram`,
    );
    // }

    return updatedProcess;
  }
}
