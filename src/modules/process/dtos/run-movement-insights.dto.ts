import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

const runMovementInsightsSchema = z.object({
  texto: z.string().min(1, 'Texto da movimentação é obrigatório'),
  prompt: z.string().min(1, 'Prompt é obrigatório'),
});

type RunMovementInsightsDTO = z.infer<typeof runMovementInsightsSchema>;
class RunMovementInsightsSchemaBody extends createZodDto(
  runMovementInsightsSchema,
) {}
const runMovementInsightsSchemaPipe = new ZodValidationPipe(
  runMovementInsightsSchema,
);

export {
  RunMovementInsightsDTO,
  RunMovementInsightsSchemaBody,
  runMovementInsightsSchemaPipe,
};
