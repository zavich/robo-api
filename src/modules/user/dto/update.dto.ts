import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

const updateUserSchema = z.object({
  email: z.string().email('E-mail inválido').optional(),
  name: z.string().optional(),
  password: z
    .string()
    .min(6, 'A senha deve ter no mínimo 6 caracteres')
    .optional(),
});

type UpdateNotificationDTO = z.infer<typeof updateUserSchema>;
class UpdateUserSchemaBody extends createZodDto(updateUserSchema) {}
const updateUserSchemaPipe = new ZodValidationPipe(updateUserSchema);

export { UpdateNotificationDTO, UpdateUserSchemaBody, updateUserSchemaPipe };
