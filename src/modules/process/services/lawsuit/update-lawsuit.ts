import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Process } from '../../schema/process.schema';
import { Model } from 'mongoose';
import { UpdateProcessDTO } from '../../dtos/update-lawsuit.dto';
import { PipedriveFormData } from '../../interfaces/process.interface';

@Injectable()
export class UpdateLawsuitService {
  constructor(
    @InjectModel(Process.name)
    private readonly lawsuitModule: Model<Process>,
  ) {}

  async execute(number: string, data: UpdateProcessDTO) {
    try {
      const lawsuit = await this.lawsuitModule.findOne({ number });

      if (!lawsuit) {
        throw new BadRequestException('Lawsuit not found');
      }

      // Campos válidos para formPipedrive
      const formPipedriveFields = [
        'title',
        'processNumber',
        'executionNumber',
        'duplicated',
        'dl',
        'firstDegree',
        'secondDefendantResponsibility',
        'defendants',
        'analysis',
        'sd',
        'fgts',
        'freeJustice',
        'sucumbencia',
        'jornadaOuCP',
        'multaEmbargos',
        'alvara',
        'cessaoCredito',
        'conclusion',
        'minValueEstimate',
        'prazo',
        'abatimento',
        'observacao',
        'observacaoPreAnalise',
        'value',
        'calculoAutos',
        'calculoAutosValue',
        'calculoHomologado',
        'execucaoProvisoria',
      ];

      // Separa os campos do formPipedrive dos outros campos
      const { formPipedrive: formPipedriveFromBody, ...restData } = data;
      
      // Extrai campos do formPipedrive que vieram diretamente no body
      const formPipedriveFromDirectFields: Partial<PipedriveFormData> = {};
      const updateData: any = {};

      // Processa cada campo do body
      for (const [key, value] of Object.entries(data)) {
        if (key === 'formPipedrive') {
          // Se formPipedrive já veio como objeto, usa ele
          continue;
        } else if (formPipedriveFields.includes(key)) {
          // Se o campo é do formPipedrive, adiciona ao objeto formPipedrive
          if (value !== undefined && value !== null && value !== '') {
            formPipedriveFromDirectFields[key] = value;
          }
        } else if (key !== 'number') {
          // Outros campos vão para updateData (exceto number que não deve ser atualizado)
          updateData[key] = value;
        }
      }

      // Combina formPipedrive do body com os campos diretos
      // Se formPipedrive veio no body, usa ele diretamente (sobrescreve tudo)
      // Caso contrário, mescla com os dados existentes
      let finalFormPipedrive: Partial<PipedriveFormData> = {};
      
      if (formPipedriveFromBody) {
        // Se formPipedrive veio como objeto, usa ele diretamente
        finalFormPipedrive = { ...formPipedriveFromBody };
      } else {
        // Caso contrário, mantém dados existentes e adiciona/atualiza com campos diretos
        finalFormPipedrive = {
          ...(lawsuit.formPipedrive || {}), // Mantém dados existentes
          ...formPipedriveFromDirectFields, // Sobrescreve com campos diretos
        };
      }

      // Adiciona formPipedrive ao updateData se houver campos para atualizar
      if (Object.keys(finalFormPipedrive).length > 0) {
        updateData.formPipedrive = finalFormPipedrive;
        console.log('[UpdateLawsuitService] Salvando formPipedrive:', JSON.stringify(finalFormPipedrive, null, 2));
      } else {
        console.log('[UpdateLawsuitService] Nenhum campo formPipedrive para salvar');
      }

      const update = await this.lawsuitModule.findByIdAndUpdate(
        lawsuit._id,
        { $set: updateData },
        { new: true },
      );
      return update;
    } catch (err) {
      throw new Error(err.message);
    }
  }
}
