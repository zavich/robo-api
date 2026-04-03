import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { TypeActivity } from '../../interfaces/enum';

const createActivitySchema = z.object({
  type: z.nativeEnum(TypeActivity, {
    required_error: 'O tipo da atividade é obrigatório',
    invalid_type_error: 'Tipo de atividade inválido',
  }),
  assignedTo: z
    .string({ required_error: 'O usuário responsável é obrigatório' })
    .regex(/^[0-9a-fA-F]{24}$/, 'ID de usuário inválido'),
  processes: z
    .array(
      z
        .string({ invalid_type_error: 'ID de processo inválido' })
        .regex(/^[0-9a-fA-F]{24}$/, 'ID de processo inválido'),
    )
    .min(1, 'É necessário associar a atividade a pelo menos um processo'),
});

type CreateActivityDTO = z.infer<typeof createActivitySchema>;
class CreateActivitySchemaBody extends createZodDto(createActivitySchema) {}
const createActivitySchemaPipe = new ZodValidationPipe(createActivitySchema);

export {
  CreateActivityDTO,
  CreateActivitySchemaBody,
  createActivitySchemaPipe,
};
