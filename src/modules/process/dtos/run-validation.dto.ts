import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

const runValidationSchema = z.object({
  lawsuits: z.array(z.string()).default([]),
  step: z.string().min(1, 'Step é obrigatório'),
  isAll: z.boolean().optional().default(false),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

type RunValidationDTO = z.infer<typeof runValidationSchema>;
class RunValidationSchemaBody extends createZodDto(runValidationSchema) {}
const runValidationSchemaPipe = new ZodValidationPipe(runValidationSchema);

export { RunValidationDTO, RunValidationSchemaBody, runValidationSchemaPipe };
