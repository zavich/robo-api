import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

const runLawsuitsSchema = z.object({
  lawsuits: z.array(z.string().min(1)).default([]),
  documents: z.boolean().optional().default(false),
  name: z.string().optional(),
  log: z.string().optional(),
  errorReason: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

type RunLawsuitsDTO = z.infer<typeof runLawsuitsSchema>;
class RunLawsuitsSchemaBody extends createZodDto(runLawsuitsSchema) {}
const runLawsuitsSchemaPipe = new ZodValidationPipe(runLawsuitsSchema);

export { RunLawsuitsDTO, RunLawsuitsSchemaBody, runLawsuitsSchemaPipe };
