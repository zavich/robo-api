import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { ActivityStatus, TypeActivity } from '../../interfaces/enum';

const completedActivitySchema = z
  .object({
    notes: z.string().max(500).optional(),
    type: z.nativeEnum(TypeActivity),
    status: z.nativeEnum(ActivityStatus),
    lossReason: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.status === ActivityStatus.LOSS &&
      (!data.lossReason || data.lossReason.trim() === '')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'lossReason é obrigatório quando o status for LOSS',
        path: ['lossReason'],
      });
    }
  });

type CompletedActivityDTO = z.infer<typeof completedActivitySchema>;
class CompletedActivitySchemaBody extends createZodDto(
  completedActivitySchema,
) {}
const completedActivitySchemaPipe = new ZodValidationPipe(
  completedActivitySchema,
);

export {
  CompletedActivityDTO,
  CompletedActivitySchemaBody,
  completedActivitySchemaPipe,
};
