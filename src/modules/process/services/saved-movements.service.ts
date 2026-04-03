import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Process as ProcessEntity } from '../schema/process.schema';

@Injectable()
export class SavedMovementsService {
  private readonly logger = new Logger(SavedMovementsService.name);

  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModel: Model<ProcessEntity>,
  ) {}
  async execute(
    number: string,
    instance: 'PRIMEIRO_GRAU' | 'SEGUNDO_GRAU' | 'TST',
  ) {
    try {
      const process = await this.processModel.findOne({ number });
      if (!process) {
        this.logger.warn(`Processo não encontrado: ${number}`);
        return;
      }
      const oldMoviment = process.oldMoviments || {};
      if (instance === 'PRIMEIRO_GRAU') {
        oldMoviment.primeiroGrau = process?.instancias?.[0]?.moviments?.length;
      }
      if (instance === 'SEGUNDO_GRAU') {
        oldMoviment.segundoGrau = process?.instancias?.[1]?.moviments?.length;
      }
      if (instance === 'TST') {
        oldMoviment.tst =
          (process.autosData as any)?.movements?.length || undefined;
      }
      const updateProcess = await this.processModel.findByIdAndUpdate(
        process._id,
        {
          $set: { oldMoviments: oldMoviment },
        },
        { new: true },
      );
      return updateProcess;
    } catch (error) {
      this.logger.error(
        `Erro ao executar SavedMovementsService para o processo ${number}: ${error.message}`,
      );
      throw error;
    }
  }
}
