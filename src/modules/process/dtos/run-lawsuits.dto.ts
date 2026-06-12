import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/;

const runLawsuitsSchema = z
  .object({
    lawsuits: z.array(z.string().min(1)).default([]),
    documents: z.boolean().optional().default(false),
    name: z.string().optional(),
    log: z.string().optional(),
    errorReason: z.string().optional(),
    startDate: z
      .string()
      .regex(dateRegex, 'startDate must be in YYYY-MM-DD or ISO format')
      .optional(),
    endDate: z
      .string()
      .regex(dateRegex, 'endDate must be in YYYY-MM-DD or ISO format')
      .optional(),
  })
  .refine(
    (data) =>
      data.lawsuits.length > 0 ||
      data.name !== undefined ||
      data.startDate !== undefined ||
      data.endDate !== undefined,
    {
      message:
        'When lawsuits is empty, at least one filter (name, startDate, or endDate) must be provided',
    },
  );

type RunLawsuitsDTO = z.infer<typeof runLawsuitsSchema>;
class RunLawsuitsSchemaBody extends createZodDto(runLawsuitsSchema) {}
const runLawsuitsSchemaPipe = new ZodValidationPipe(runLawsuitsSchema);

export { RunLawsuitsDTO, RunLawsuitsSchemaBody, runLawsuitsSchemaPipe };
