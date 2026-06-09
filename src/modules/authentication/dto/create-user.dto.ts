import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

// Valida e normaliza o e-mail (trim + lowercase) no parse, pra casar com o
// lookup do SSO e evitar 500 quando o campo vier ausente/null/tipo errado.
const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  name: z.string().trim().min(1),
});

type CreateUserDto = z.infer<typeof createUserSchema>;
class CreateUserSchemaBody extends createZodDto(createUserSchema) {}
const createUserSchemaPipe = new ZodValidationPipe(createUserSchema);

export { CreateUserDto, CreateUserSchemaBody, createUserSchemaPipe };
