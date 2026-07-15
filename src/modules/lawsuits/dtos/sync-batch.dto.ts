import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

// Cada CNJ do lote pode disparar uma resolução de captcha real (custo em
// dinheiro, ver TriggerScrapingService) — limite conservador pra não deixar
// um lote gigante gerar custo grande de uma vez por engano.
export const SYNC_BATCH_MAX_SIZE = 50;

// Concorrência interna ao processar o lote: protege Redis/Athena/scraping-robo-api
// de uma rajada de N chamadas simultâneas (nenhuma dessas camadas tem limite
// próprio hoje quando chamadas uma por vez em loop).
export const SYNC_BATCH_CONCURRENCY = 5;

const syncBatchSchema = z.object({
  numerosCnj: z.array(z.string().min(1)).min(1).max(SYNC_BATCH_MAX_SIZE),
});

type SyncBatchDTO = z.infer<typeof syncBatchSchema>;
class SyncBatchSchemaBody extends createZodDto(syncBatchSchema) {}
const syncBatchSchemaPipe = new ZodValidationPipe(syncBatchSchema);

export { SyncBatchDTO, SyncBatchSchemaBody, syncBatchSchemaPipe };
