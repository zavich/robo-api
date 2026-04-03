import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const LossReasonsFiltersSchema = z.object({
	search: z.string().optional().describe('Termo para buscar nos motivos de perda'),
	category: z.enum(['PRÉ-ANÁLISE', 'ANÁLISE']).optional().describe('Categoria dos motivos de perda'),
});

export class LossReasonsFiltersDto extends createZodDto(LossReasonsFiltersSchema) {}