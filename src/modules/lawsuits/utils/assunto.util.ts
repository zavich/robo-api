export interface AssuntoRaw {
  codigo?: string | number;
  descricao?: string;
  principal?: boolean;
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

// `Instancia.assunto` está tipado como `string`, mas o payload real do
// webhook manda um array de `{codigo, descricao, principal}` (confirmado no
// JSON cru do PJe).
export function extractAssuntos(assunto: unknown): {
  principal: string | null;
  principalCodigo: number | null;
  json: string | null;
} {
  if (typeof assunto === 'string') {
    return { principal: assunto || null, principalCodigo: null, json: null };
  }

  if (!Array.isArray(assunto) || assunto.length === 0) {
    return { principal: null, principalCodigo: null, json: null };
  }

  const lista = assunto as AssuntoRaw[];
  const principal = lista.find((a) => a?.principal) ?? lista[0];

  return {
    principal: principal?.descricao ?? null,
    principalCodigo: toNumberOrNull(principal?.codigo),
    json: JSON.stringify(lista),
  };
}
