import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Process, ProcessDocument } from '../schema/process.schema';

@Injectable()
export class RemoveProvisionalLawsuitNumberService {
  constructor(
    @InjectModel(Process.name)
    private readonly processModel: Model<ProcessDocument>,
  ) {}

  async execute(processId: string) {
    console.log(`[RemoveProvisionalLawsuitNumberService] Starting removal for processId: ${processId}`);

    // Verificar se o processo existe
    const process = await this.processModel.findById(processId);
    if (!process) {
      throw new NotFoundException('Processo não encontrado');
    }

    // Atualizar o processo removendo o campo calledByProvisionalLawsuitNumber
    const updatedProcess = await this.processModel.findByIdAndUpdate(
      processId,
      {
        $unset: {
          calledByProvisionalLawsuitNumber: ""
        }
      },
      { new: true }
    );

    return {
      message: 'Campo calledByProvisionalLawsuitNumber removido com sucesso',
      processId: processId,
      processNumber: updatedProcess.number,
      previousValue: process.calledByProvisionalLawsuitNumber,
      timestamp: new Date().toISOString()
    };
  }
}