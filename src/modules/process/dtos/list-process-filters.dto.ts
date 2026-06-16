import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { CLASSPROCESS } from '../interfaces/enum';

// Query params chegam como strings — z.boolean() puro rejeita "true"/"false".
// z.coerce.boolean() também não funciona: Boolean("false") === true.
const boolQuery = () =>
  z
    .preprocess(
      (val) => (val === 'true' ? true : val === 'false' ? false : val),
      z.boolean(),
    )
    .optional();

const ListProcessFiltersSchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  search: z.string().optional(),
  status: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  lossReason: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      'Filtro por motivo de perda/rejeição (aceita string única ou array de strings)',
    ),
  emptyDocuments: boolQuery().describe('Filtra processos com documentos vazios'),
  emptyInstances: boolQuery().describe('Filtra processos com instâncias vazias'),
  hasNewMovements: boolQuery().describe('Filtra processos com novos movimentos'),
  classProcess: z
    .nativeEnum(CLASSPROCESS)
    .optional()
    .describe('Filtro por classe do processo'),
  hasSecondInstance: boolQuery().describe('Filtra processos que possuem segunda instância'),
  hasAutos: boolQuery().describe('Filtra processos que possuem movimentação no TST'),
  hasAcordao: boolQuery().describe('Filtra processos que possuem acórdão'),
});

class ListProcessFiltersDto extends createZodDto(ListProcessFiltersSchema) {}

type ListProcessFiltersType = z.infer<typeof ListProcessFiltersSchema>;
const listProcessSchemaPipe = new ZodValidationPipe(ListProcessFiltersSchema);
export {
  ListProcessFiltersDto,
  ListProcessFiltersSchema,
  ListProcessFiltersType,
  listProcessSchemaPipe,
};
