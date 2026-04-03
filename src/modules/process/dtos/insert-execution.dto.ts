import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

const insertExecutionSchema = z.object({
  lawsuitExecution: z
    .string()
    .min(1, 'Número do processo de execução é obrigatório')
    .regex(
      /^\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4}$/,
      'Formato do número do processo inválido. Use o formato: 0000000-00.0000.0.00.0000'
    )
    .describe('Número do processo de execução no formato padrão CNJ'),
  pipedriveFieldValue: z
    .string()
    .optional()
    .describe('Valor para o campo customizado do Pipedrive (fc5f94cbf972eacef5050f1f53b4f88f1770f87c)')
});

type InsertExecutionDTO = z.infer<typeof insertExecutionSchema>;
class InsertExecutionSchemaBody extends createZodDto(insertExecutionSchema) {}
const insertExecutionSchemaPipe = new ZodValidationPipe(insertExecutionSchema);

export { 
  InsertExecutionDTO, 
  InsertExecutionSchemaBody, 
  insertExecutionSchemaPipe 
};