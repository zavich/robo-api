import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const ListReasonLossSchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  search: z.string().optional(),
});

export class ListReasonLossDto extends createZodDto(ListReasonLossSchema) {}
