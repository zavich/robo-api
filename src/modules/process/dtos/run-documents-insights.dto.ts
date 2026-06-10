import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

const runDocumentsInsightsSchema = z.object({
  number: z.string().min(1, 'Número do processo é obrigatório'),
  documents: z.array(z.string()).min(1, 'Pelo menos um documento é necessário'),
  prompt: z.string().min(1, 'Prompt é obrigatório'),
});

type RunDocumentsInsightsDTO = z.infer<typeof runDocumentsInsightsSchema>;
class RunDocumentsInsightsSchemaBody extends createZodDto(
  runDocumentsInsightsSchema,
) {}
const runDocumentsInsightsSchemaPipe = new ZodValidationPipe(
  runDocumentsInsightsSchema,
);

export {
  RunDocumentsInsightsDTO,
  RunDocumentsInsightsSchemaBody,
  runDocumentsInsightsSchemaPipe,
};
