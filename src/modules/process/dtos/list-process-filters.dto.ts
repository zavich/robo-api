import { z } from 'zod';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { ActivityStatus } from '../interfaces/enum';

const ListProcessFiltersSchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  search: z.string().optional(),
  status: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  lossReason: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      'Filtro por motivo de perda/rejeição (aceita string única ou array de strings)',
    ),
  emptyDocuments: z
    .boolean()
    .optional()
    .describe('Filtra processos com documentos vazios'),
  emptyInstances: z
    .boolean()
    .optional()
    .describe('Filtra processos com instâncias vazias'),
  hasNewMovements: z
    .boolean()
    .optional()
    .describe('Filtra processos com novos movimentos'),
  type: z
    .nativeEnum(ActivityStatus)
    .optional()
    .describe('Filtro por tipo do processo'),
});

class ListProcessFiltersDto extends createZodDto(ListProcessFiltersSchema) {}

type ListProcessFiltersType = z.infer<typeof ListProcessFiltersSchema>;
const listProcessSchemaPipe = new ZodValidationPipe(ListProcessFiltersSchema);
export {
  ListProcessFiltersSchema,
  ListProcessFiltersDto,
  ListProcessFiltersType,
  listProcessSchemaPipe,
};
