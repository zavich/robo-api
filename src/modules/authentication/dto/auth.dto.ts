import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

// Valida e normaliza o e-mail (trim + lowercase) já no parse, pra casar com o
// lookup do SSO e evitar 500 quando o campo vier ausente/null/tipo errado.
// `min(8)` preserva a regra de senha mínima introduzida no refactor.
const authSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
});

type AuthDto = z.infer<typeof authSchema>;
class AuthSchemaBody extends createZodDto(authSchema) {}
const authSchemaPipe = new ZodValidationPipe(authSchema);

export { AuthDto, AuthSchemaBody, authSchemaPipe };
