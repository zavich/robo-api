import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

const createReasonLossSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
});
type CreateReasonLossDTO = z.infer<typeof createReasonLossSchema>;
class CreateReasonLossSchemaBody extends createZodDto(createReasonLossSchema) {}
const createReasonLossSchemaPipe = new ZodValidationPipe(
  createReasonLossSchema,
);

export {
  CreateReasonLossDTO,
  CreateReasonLossSchemaBody,
  createReasonLossSchemaPipe,
};
