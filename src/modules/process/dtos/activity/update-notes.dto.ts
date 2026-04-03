import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { TypeActivity } from '../../interfaces/enum';

const updateActivityNotesSchema = z.object({
  type: z.nativeEnum(TypeActivity, {
    required_error: 'O tipo da atividade é obrigatório',
    invalid_type_error: 'Tipo de atividade inválido',
  }),
  notes: z.string().optional(), // Sem limite de caracteres para suportar HTML completo do Pipedrive
});

type UpdateActivityNotesDTO = z.infer<typeof updateActivityNotesSchema>;
class UpdateActivityNotesSchemaBody extends createZodDto(
  updateActivityNotesSchema,
) {}
const updateActivityNotesSchemaPipe = new ZodValidationPipe(
  updateActivityNotesSchema,
);

export {
  UpdateActivityNotesDTO,
  UpdateActivityNotesSchemaBody,
  updateActivityNotesSchemaPipe,
};

