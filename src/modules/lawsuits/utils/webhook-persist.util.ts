import { Root } from 'src/modules/process/interfaces/process.interface';

export interface PersistDecision {
  persist: boolean;
  reason?: string;
}

// Guards compartilhados entre os serviços que persistem o webhook (Parquet e
// o JSON espelho em comunicacao-spot) — mesma regra nos dois lugares: sem
// dado novo de verdade (processo não encontrado, ou erro com motivo
// conhecido), não vale a pena gravar/sobrescrever nada.
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
