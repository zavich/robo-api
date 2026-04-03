import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

// Schema para os filtros (baseado em ListProcessFiltersDto)
const bulkUpdateFiltersSchema = z.object({
  search: z.string().optional(),
  situation: z.enum(['PENDING', 'APPROVED', 'LOSS']).optional().describe('Filtra por situação do processo'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  lossReason: z.union([z.string(), z.array(z.string())]).optional(),
  emptyDocuments: z.boolean().optional(),
  emptyInstances: z.boolean().optional(),
  hasNewMovements: z.boolean().optional(),
  stage: z.enum(['PRE_ANALISE', 'ANALISE', 'CALCULO']).optional(),
});

// Schema para as atualizações
const bulkUpdateDataSchema = z.object({
  owner: z.string().optional().describe('ID do usuário para atribuir como responsável'),
  stage: z.enum(['PRE_ANALISE', 'ANALISE', 'CALCULO']).optional().describe('Novo estágio do processo'),
  stageId: z.number().optional().describe('ID do estágio no Pipedrive'),
  situation: z.enum(['PENDING', 'APPROVED', 'LOSS']).optional().describe('Nova situação do processo'),
  rejectionReason: z.string().optional().describe('Motivo da rejeição (obrigatório quando situation=LOSS)'),
  rejectionDescription: z.string().optional().describe('Descrição adicional da rejeição'),
  isCustomReason: z.boolean().optional().describe('Se o motivo de rejeição é customizado'),
});

// Schema principal
const bulkUpdateSchema = z.object({
  filters: bulkUpdateFiltersSchema,
  updates: bulkUpdateDataSchema,
});

export type BulkUpdateFilters = z.infer<typeof bulkUpdateFiltersSchema>;
export type BulkUpdateData = z.infer<typeof bulkUpdateDataSchema>;
export type BulkUpdateDTO = z.infer<typeof bulkUpdateSchema>;

export class BulkUpdateSchemaBody extends createZodDto(bulkUpdateSchema) {}
export const bulkUpdateSchemaPipe = new ZodValidationPipe(bulkUpdateSchema);

