import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const ListPromptSchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional(),
  search: z.string().optional(),
});

export class ListPromptDto extends createZodDto(ListPromptSchema) {}
