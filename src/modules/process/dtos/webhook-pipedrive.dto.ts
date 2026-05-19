import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

const webhookPipedriveSchema = z.object({
  num_processo: z.string().min(1, 'Número do processo é obrigatório'),
  deal_id: z.union([z.string(), z.number()]).optional(),
  stage_id: z.union([z.string(), z.number()]).optional(),
});

type WebhookPipedriveDTO = z.infer<typeof webhookPipedriveSchema>;
class WebhookPipedriveSchemaBody extends createZodDto(webhookPipedriveSchema) {}
const webhookPipedriveSchemaPipe = new ZodValidationPipe(webhookPipedriveSchema);

export {
  WebhookPipedriveDTO,
  WebhookPipedriveSchemaBody,
  webhookPipedriveSchemaPipe,
};
