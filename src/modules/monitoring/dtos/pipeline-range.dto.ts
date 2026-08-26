import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

// Janelas fixas em vez de um intervalo livre: cada hora consultada é um
// HGETALL, e o TTL dos buckets é de 8 dias — um range arbitrário permitiria
// pedir uma janela que o storage não cobre, ou grande o bastante para pesar
// sem entregar informação nova.
export const RANGE_HOURS: Record<string, number> = {
  '1h': 1,
  '6h': 6,
  '24h': 24,
  '7d': 24 * 7,
};

const pipelineRangeSchema = z.object({
  range: z.enum(['1h', '6h', '24h', '7d']).default('24h'),
});

type PipelineRangeDTO = z.infer<typeof pipelineRangeSchema>;
class PipelineRangeQuery extends createZodDto(pipelineRangeSchema) {}
const pipelineRangePipe = new ZodValidationPipe(pipelineRangeSchema);

export { PipelineRangeDTO, PipelineRangeQuery, pipelineRangePipe };
