import { parseCnj } from './cnj.util';

export interface ComunicacaoSpotObjectRef {
  bucket: string;
  key: string;
}

// Mesmo layout usado pelo coletor Python (communication-ingestor-juri) e por
// `SaveWebhookToComunicacaoSpotService` — centralizado aqui pra quem só
// precisa achar o caminho do arquivo (ex.: checar se já existe) sem
// depender do fluxo completo de merge do webhook.
export function resolveComunicacaoSpotObject(
  location: string,
  numeroCnj: string,
): ComunicacaoSpotObjectRef | null {
  const parsed = parseCnj(numeroCnj);
  if (!parsed) {
    return null;
  }

  const bucket = location.replace('s3://', '').split('/')[0];
  const prefixWithoutBucket = location
    .replace('s3://', '')
    .split('/')
    .slice(1)
    .join('/');

  // O CNJ tribunal "00" (Justiça do Trabalho -> TST) tem pasta própria
  // "TST", separada de "TRT90" (CSJT) — mesma regra do objectKey original.
  const pasta = parsed.trt === 'TRT0' ? 'TST' : parsed.trt;
  const cnjSemPontuacao = numeroCnj.replace(/\D/g, '');

  return {
    bucket,
    key: `${prefixWithoutBucket}/${pasta}/${parsed.anoProcesso}/${cnjSemPontuacao}.json`,
  };
}
