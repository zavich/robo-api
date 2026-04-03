import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { NotificationTypeEnum } from '../schema/notication.schema';

const createNotificationSchema = z.object({
  title: z.string({ required_error: 'O título da notificação é obrigatório' }),
  description: z.string({
    required_error: 'A descrição da notificação é obrigatória',
  }),
  userId: z
    .string({ required_error: 'O ID do usuário é obrigatório' })
    .regex(/^[0-9a-fA-F]{24}$/, 'ID de usuário inválido'),
  type: z.nativeEnum(NotificationTypeEnum, {
    required_error: 'O tipo da notificação é obrigatório',
    invalid_type_error: 'Tipo de notificação inválido',
  }),
  redirectId: z.string().optional(),
});

type CreateNotificationDTO = z.infer<typeof createNotificationSchema>;
class CreateNotificationSchemaBody extends createZodDto(
  createNotificationSchema,
) {}
const createNotificationSchemaPipe = new ZodValidationPipe(
  createNotificationSchema,
);

export {
  CreateNotificationDTO,
  CreateNotificationSchemaBody,
  createNotificationSchemaPipe,
};
