// Formato CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO — grupos: sequencial, dígito
// verificador, ano, segmento do judiciário, tribunal, unidade de origem.
const NUMERO_CNJ_PATTERN = /^\d{7}-\d{2}\.(\d{4})\.\d\.(\d{2})\.\d{4}$/;

export interface ParsedCnj {
  trt: string;
  anoProcesso: number;
}

export function parseCnj(numeroCnj: string): ParsedCnj | null {
  const match = NUMERO_CNJ_PATTERN.exec(numeroCnj);
  if (!match) {
    return null;
  }

  const [, anoProcesso, tribunalCodigo] = match;
  return {
    trt: `TRT${parseInt(tribunalCodigo, 10)}`,
    anoProcesso: parseInt(anoProcesso, 10),
  };
}
