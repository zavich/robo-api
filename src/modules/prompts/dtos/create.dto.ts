import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

const createPromptSchema = z
  .object({
    type: z.string(),
    text: z.string(),
  })
  .required();
type CreatePromptDTO = z.infer<typeof createPromptSchema>;
class CreatePromptSchemaBody extends createZodDto(createPromptSchema) {}
const createPromptSchemaPipe = new ZodValidationPipe(createPromptSchema);

export { CreatePromptDTO, CreatePromptSchemaBody, createPromptSchemaPipe };
