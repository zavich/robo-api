import { randomUUID } from 'crypto';
import { Root } from 'src/modules/process/interfaces/process.interface';

// Formato mínimo confirmado contra um JSON real gravado pelo coletor Python
// (communication-ingestor-juri) em comunicacao-spot — mantém só os campos que
// esse coletor realmente usa (sem `link_api`/`enviar_callback`/`event`/`uuid`,
// que não aparecem nos arquivos reais), com dados vazios até a busca de
// verdade preencher `resposta.instancias`.
export function buildBuscandoPlaceholder(numeroCnj: string): Root {
  const now = new Date();

  return {
    id: Math.floor(Math.random() * 90_000_000_000) + 10_000_000_000,
    webhookId: randomUUID(),
    created_at: {
      date: now.toISOString().slice(0, 19).replace('T', ' '),
      timezone_type: 3,
      timezone: 'UTC',
    },
    numero_processo: numeroCnj,
    resposta: {
      numero_unico: numeroCnj,
      origem: '',
      instancias: [],
    } as Root['resposta'],
    status: 'BUSCANDO',
    motivo_erro: null,
    status_callback: null,
    tipo: 'BUSCA_PROCESSO',
    opcoes: { documento: false },
    tribunal: {
      sigla: 'TRT',
      nome: 'Tribunal Regional do Trabalho',
      busca_processo: 1,
    } as Root['tribunal'],
    valor: numeroCnj,
  } as Root;
}
