import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

const runValidationSchema = z.object({
  number: z.string().min(1, 'Número do processo é obrigatório'),
  step: z.string().min(1, 'Step é obrigatório'),
  isAll: z.boolean().optional().default(false),
});

type RunValidationDTO = z.infer<typeof runValidationSchema>;
class RunValidationSchemaBody extends createZodDto(runValidationSchema) {}
const runValidationSchemaPipe = new ZodValidationPipe(runValidationSchema);

export { RunValidationDTO, RunValidationSchemaBody, runValidationSchemaPipe };
