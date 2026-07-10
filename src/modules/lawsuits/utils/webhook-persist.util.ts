import { Root } from 'src/modules/process/interfaces/process.interface';

export interface PersistDecision {
  persist: boolean;
  reason?: string;
}

// Guards compartilhados entre os serviços que persistem o webhook (Parquet e
// Redis) — sem dado novo de verdade (processo não encontrado, ou erro com
// motivo conhecido), não vale a pena gravar/sobrescrever nada.
export function decideWebhookPersist(body: Root): PersistDecision {
  if (body.status === 'NAO_ENCONTRADO') {
    return { persist: false, reason: 'NAO_ENCONTRADO' };
  }

  if (body.status === 'ERRO' && body.motivo_erro != null) {
    return {
      persist: false,
      reason: `ERRO (motivo_erro=${JSON.stringify(body.motivo_erro)})`,
    };
  }

  return { persist: true };
}

// Mesma regra de base, mas pro JSON espelho em comunicacao-spot — que,
// diferente do Parquet (append-only) e do Redis (cache "última leitura
// boa"), agora também recebe marcadores "BUSCANDO" (via
// `InsertLawsuitPlaceholderService`) sem nenhum dado real. Nesses casos,
// bloquear a atualização quando o webhook volta NAO_ENCONTRADO/ERRO deixaria
// o arquivo preso em "BUSCANDO" pra sempre, mesmo a busca real já tendo
// terminado (com esse resultado). Só continua bloqueando quando já existe
// dado de verdade (`resposta.instancias` não vazio) — aí sim, um retry com
// erro não deve apagar um resultado bom anterior.
export function decideComunicacaoSpotPersist(
  body: Root,
  existing: Root | null,
): PersistDecision {
  const existingHasRealData = (existing?.resposta?.instancias?.length ?? 0) > 0;

  if (body.status === 'NAO_ENCONTRADO') {
    if (existingHasRealData) {
      return {
        persist: false,
        reason: 'NAO_ENCONTRADO (mantendo dado real já existente em comunicacao-spot)',
      };
    }
    return { persist: true };
  }

  if (body.status === 'ERRO' && body.motivo_erro != null) {
    if (existingHasRealData) {
      return {
        persist: false,
        reason: `ERRO (motivo_erro=${JSON.stringify(body.motivo_erro)}) mantendo dado real já existente em comunicacao-spot`,
      };
    }
    return { persist: true };
  }

  return { persist: true };
}
