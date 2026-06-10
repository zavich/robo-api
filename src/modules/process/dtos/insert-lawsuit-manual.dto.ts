import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

const insertLawsuitManualItemSchema = z.object({
  num_processo: z.string().min(1, 'Número do processo é obrigatório'),
  deal_id: z.union([z.string(), z.number()]).optional(),
  stage_id: z.union([z.string(), z.number()]).optional(),
});

const insertLawsuitManualSchema = z
  .array(insertLawsuitManualItemSchema)
  .min(1, 'Pelo menos um processo é necessário');

type InsertLawsuitManualItem = z.infer<typeof insertLawsuitManualItemSchema>;
type InsertLawsuitManualDTO = z.infer<typeof insertLawsuitManualSchema>;
const insertLawsuitManualSchemaPipe = new ZodValidationPipe(
  insertLawsuitManualSchema,
);

export {
  InsertLawsuitManualItem,
  InsertLawsuitManualDTO,
  insertLawsuitManualSchemaPipe,
};
