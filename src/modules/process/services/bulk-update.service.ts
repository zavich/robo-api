import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { BulkUpdateDTO } from '../dtos/bulk-update.dto';
import { Process } from '../schema/process.schema';
import { ProcessOwner } from '../schema/process-owner.schema';
import { LossReasonsService } from './loss-reasons-service';
import { StageByCode } from '../interfaces/enum';

@Injectable()
export class BulkUpdateService {
  constructor(
    @InjectModel(Process.name)
    private readonly processModel: Model<Process>,
    @InjectModel(ProcessOwner.name)
    private readonly processOwnerModel: Model<ProcessOwner>,
    private readonly lossReasonsService: LossReasonsService,
  ) {}

  async execute(bulkUpdateDto: BulkUpdateDTO, userId: string) {
    const { filters, updates } = bulkUpdateDto;

    // Validar que pelo menos uma atualização foi fornecida
    if (Object.keys(updates).length === 0) {
      throw new BadRequestException('Nenhuma atualização fornecida');
    }

    // Validar que se situation=LOSS, rejectionReason é obrigatório
    if (updates.situation === 'LOSS' && !updates.rejectionReason) {
      throw new BadRequestException(
        'rejectionReason é obrigatório quando situation=LOSS',
      );
    }

    // Construir filtros para encontrar os processos
    const query = await this.buildQuery(filters);

    // Encontrar os processos que correspondem aos filtros
    const processes = await this.processModel.find(query);

    if (processes.length === 0) {
      return {
        message: 'Nenhum processo encontrado com os filtros fornecidos',
        updatedCount: 0,
        processIds: [],
      };
    }

    const processIds = processes.map((p) => p._id);
    const updateData: any = {};

    // Preparar atualizações
    if (updates.stage) {
      updateData.stage = updates.stage;
    }

    if (updates.stageId) {
      updateData.stageId = updates.stageId;
      if (!updates.stage) {
        updateData.stage = StageByCode[updates.stageId];
      }
    }

    if (updates.situation) {
      updateData.situation = updates.situation;

      // Se for rejeição (LOSS), adicionar campos relacionados
      if (updates.situation === 'LOSS') {
        updateData.rejectionReason = updates.rejectionReason;
        updateData.rejectionDate = new Date();
        
        if (updates.rejectionDescription) {
          updateData.rejectionDescription = updates.rejectionDescription;
        }
        
        if (updates.isCustomReason !== undefined) {
          updateData.isCustomReason = updates.isCustomReason;
        }
      }

      // Se for aprovação (APPROVED), adicionar data de aprovação
      if (updates.situation === 'APPROVED') {
        updateData.approvalDate = new Date();
      }
    }

    // Atualizar processos
    let updatedCount = 0;
    if (Object.keys(updateData).length > 0) {
      const result = await this.processModel.updateMany(
        { _id: { $in: processIds } },
        { $set: updateData },
      );
      updatedCount = result.modifiedCount;
    }

    // Atualizar owner se fornecido
    if (updates.owner) {
      await this.bulkUpdateOwners(processIds, updates.owner, userId);
    }

    return {
      message: `${updatedCount} processo(s) atualizado(s) com sucesso`,
      updatedCount,
      processIds: processIds.map((id) => id.toString()),
    };
  }

  private async bulkUpdateOwners(
    processIds: any[],
    newOwnerId: string,
    requestingUserId: string,
  ) {
    // Desativar owners existentes
    await this.processOwnerModel.updateMany(
      { processId: { $in: processIds }, isActive: true },
      { $set: { isActive: false } },
    );

    // Criar novos owners
    const newOwners = processIds.map((processId) => ({
      processId,
      userId: new mongoose.Types.ObjectId(newOwnerId),
      assignedBy: new mongoose.Types.ObjectId(requestingUserId),
      assignedAt: new Date(),
      isActive: true,
    }));

    await this.processOwnerModel.insertMany(newOwners);
  }

  private async buildQuery(filters: any) {
    const query: any = {};

    // Filtro de busca
    if (filters.search && filters.search.trim() !== '') {
      query.$or = [
        { number: { $regex: filters.search, $options: 'i' } },
        { 'processParts.nome': { $regex: filters.search, $options: 'i' } },
      ];
    }

    // Filtro de situação (PENDING, APPROVED, LOSS)
    if (filters.situation) {
      query.situation = filters.situation;
    }

    // Filtro de datas
    if (filters.startDate || filters.endDate) {
      const dateFilter: any = {};
      if (filters.startDate) dateFilter.$gte = new Date(filters.startDate);
      if (filters.endDate) {
        const endDateTime = new Date(filters.endDate);
        endDateTime.setHours(23, 59, 59, 999);
        dateFilter.$lte = endDateTime;
      }
      if (Object.keys(dateFilter).length > 0) {
        query.createdAt = dateFilter;
      }
    }

    // Filtro de stage
    if (filters.stage) {
      query.stage = filters.stage;
    }

    // Filtro de movimentações novas
    if (filters.hasNewMovements !== undefined) {
      query.hasNewMovements = filters.hasNewMovements;
    }

    // Filtros de documentos e instâncias vazias
    if (filters.emptyDocuments !== undefined) {
      if (filters.emptyDocuments) {
        query.$or = query.$or || [];
        query.$or.push(
          { documents: { $exists: false } },
          { documents: { $size: 0 } },
        );
      } else {
        query.documents = { $exists: true, $ne: [] };
      }
    }

    if (filters.emptyInstances !== undefined) {
      if (filters.emptyInstances) {
        query.$or = query.$or || [];
        query.$or.push(
          { instancias: { $exists: false } },
          { instancias: { $size: 0 } },
        );
      } else {
        query.instancias = { $exists: true, $ne: [] };
      }
    }

    return query;
  }
}

