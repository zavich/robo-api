import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

const createProcessSchema = z.object({
  processes: z.string().array(),
});
type CreateProcessDTO = z.infer<typeof createProcessSchema>;
class CreateProcessSchemaBody extends createZodDto(createProcessSchema) {}
const createProcessSchemaPipe = new ZodValidationPipe(createProcessSchema);

export { CreateProcessDTO, CreateProcessSchemaBody, createProcessSchemaPipe };
