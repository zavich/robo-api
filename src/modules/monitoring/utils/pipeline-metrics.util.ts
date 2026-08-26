// Modelo de armazenamento das métricas do pipeline robo-api ↔ scraping-robo-api.
//
// Tudo vive no Redis que a aplicação já usa, em três estruturas:
//
//   pipeline:bucket:<YYYY-MM-DDTHH>  HASH   contadores agregados da hora
//   pipeline:inflight                ZSET   CNJs disparados e ainda sem retorno
//   pipeline:dispatch:<cnj>          STRING timestamp do disparo (p/ latência)
//   pipeline:recent                  LIST   últimas execuções, para a tabela
//
// A escolha por buckets horários pré-agregados (em vez de guardar um evento
// por coleta e agregar na leitura) é o que mantém a leitura barata: sete dias
// de histórico são 168 HGETALL numa única ida ao Redis, independentemente do
// volume de processos coletados nesse período.

export const PIPELINE_PREFIX = 'pipeline';

// 8 dias: cobre a janela máxima exibida (7 dias) com folga para o bucket da
// borda não sumir no meio de uma consulta feita à meia-noite.
export const BUCKET_TTL_SECONDS = 60 * 60 * 24 * 8;

// Teto para casar um webhook com o disparo que o originou. Acima disso a
// coleta é considerada perdida — e o registro do disparo pode sumir, já que
// nenhuma latência calculada a partir dele seria confiável.
export const DISPATCH_TTL_SECONDS = 60 * 60 * 6;

// Depois desse tempo um disparo sem retorno deixa de ser contado como "em
// andamento" e sai da lista: o registro do disparo já expirou (mesmo teto),
// então nem a latência dele seria calculável, e uma coleta perdida há horas
// não é informação acionável — só ruído acumulando no contador. Sem essa
// poda o ZSET cresceria sem limite, já que a única remoção é a do webhook
// que, por definição, nunca vai chegar para essas entradas.
export const INFLIGHT_HORIZON_MS = DISPATCH_TTL_SECONDS * 1000;

// Quanto tempo um disparo pode ficar sem retorno antes de ser reportado como
// travado. O pior caso saudável observado é uma coleta com documentos em TRT
// com captcha; 30 minutos fica acima disso sem esconder um travamento real.
export const STUCK_THRESHOLD_MS = 30 * 60 * 1000;

// A tabela de execuções recentes é um recurso de diagnóstico ("o que acabou
// de acontecer"), não um log — 200 linhas cobrem o uso sem virar storage.
export const RECENT_MAX = 200;

export const INFLIGHT_KEY = `${PIPELINE_PREFIX}:inflight`;
export const RECENT_KEY = `${PIPELINE_PREFIX}:recent`;

export function dispatchKey(numeroCnj: string): string {
  return `${PIPELINE_PREFIX}:dispatch:${numeroCnj}`;
}

// Bucket horário em UTC. UTC e não America/Sao_Paulo de propósito: o rótulo é
// convertido para o fuso do usuário na exibição, e gravar em horário local
// criaria uma hora duplicada e uma hora inexistente em cada mudança de
// horário de verão, corrompendo a série exatamente nesses dois pontos.
export function bucketKeyFor(date: Date): string {
  return `${PIPELINE_PREFIX}:bucket:${bucketIdFor(date)}`;
}

export function bucketIdFor(date: Date): string {
  return date.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

export function bucketKeyFromId(bucketId: string): string {
  return `${PIPELINE_PREFIX}:bucket:${bucketId}`;
}

// Ids das últimas `hours` horas, da mais antiga para a mais recente — a ordem
// da série temporal exibida no gráfico.
export function bucketIdsForRange(now: Date, hours: number): string[] {
  const ids: string[] = [];
  const cursor = new Date(now.getTime());
  cursor.setUTCMinutes(0, 0, 0);

  for (let i = hours - 1; i >= 0; i--) {
    ids.push(bucketIdFor(new Date(cursor.getTime() - i * 60 * 60 * 1000)));
  }

  return ids;
}

// Campos do HASH de bucket. Prefixos agrupam famílias de contador para que a
// leitura consiga varrer o hash sem conhecer de antemão cada motivo de erro
// ou cada TRT que apareceu na janela.
export const FIELD = {
  disparos: 'disparos',
  retornos: 'retornos',
  status: (status: string) => `status:${status}`,
  motivo: (motivo: string) => `motivo:${motivo}`,
  trtTotal: (trt: string) => `trt:${trt}:total`,
  trtRetornos: (trt: string) => `trt:${trt}:retornos`,
  trtErro: (trt: string) => `trt:${trt}:erro`,
  trtLatSum: (trt: string) => `trt:${trt}:lat:sum`,
  trtLatCount: (trt: string) => `trt:${trt}:lat:count`,
  latSum: 'lat:sum',
  latCount: 'lat:count',
  latHist: (faixa: string) => `lat:h:${faixa}`,
  stageSum: (estagio: string) => `stage:${estagio}:sum`,
  stageCount: (estagio: string) => `stage:${estagio}:count`,
} as const;

export const STAGE_NAMES = [
  'fila',
  'login',
  'movimentacoes',
  'documentosPublicos',
  'documentosRestritos',
  'total',
] as const;

export type StageName = (typeof STAGE_NAMES)[number];

// Histograma de latência com faixas fixas. Guardar as amostras cruas daria
// percentis exatos, mas cresce sem teto com o volume; o histograma tem custo
// constante por bucket e erro limitado à largura da faixa — suficiente para
// responder "está mais lento que ontem?", que é a pergunta da tela.
export const LATENCY_BOUNDS_MS = [
  10_000, 30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000,
];

export function latencyBucketLabel(ms: number): string {
  for (const bound of LATENCY_BOUNDS_MS) {
    if (ms < bound) return String(bound);
  }
  return 'inf';
}

// Percentil estimado por interpolação linear dentro da faixa em que ele cai.
// A faixa aberta final ('inf') não tem limite superior para interpolar, então
// devolve o seu piso — reportar 30min quando o valor real é maior é honesto,
// e é o pior caso já visível como problema na tela.
export function estimatePercentile(
  histogram: Record<string, number>,
  percentile: number,
): number | null {
  const labels = [...LATENCY_BOUNDS_MS.map(String), 'inf'];
  const total = labels.reduce((acc, label) => acc + (histogram[label] ?? 0), 0);

  if (total === 0) return null;

  const alvo = total * percentile;
  let acumulado = 0;
  let pisoFaixa = 0;

  for (const label of labels) {
    const contagem = histogram[label] ?? 0;
    if (contagem === 0) {
      if (label !== 'inf') pisoFaixa = Number(label);
      continue;
    }

    if (acumulado + contagem >= alvo) {
      if (label === 'inf') return pisoFaixa;

      const tetoFaixa = Number(label);
      const posicaoNaFaixa = (alvo - acumulado) / contagem;
      return Math.round(
        pisoFaixa + (tetoFaixa - pisoFaixa) * Math.min(posicaoNaFaixa, 1),
      );
    }

    acumulado += contagem;
    if (label !== 'inf') pisoFaixa = Number(label);
  }

  return pisoFaixa;
}

export function media(soma: number, contagem: number): number | null {
  return contagem > 0 ? Math.round(soma / contagem) : null;
}
