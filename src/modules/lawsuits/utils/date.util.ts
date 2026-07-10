export function toDateOrNull(value: string | undefined | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// `Movimentacoes.data` chega formatado como DD/MM/YYYY (pt-BR) — `new Date(...)`
// interpreta isso como MM/DD/YYYY e vira "Invalid Date" pra qualquer dia > 12,
// perdendo a data silenciosamente. Faz o parse manual do formato brasileiro.
const BR_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function toDateFromBrOrNull(
  value: string | undefined | null,
): Date | null {
  if (!value) return null;

  const match = BR_DATE_PATTERN.exec(value.trim());
  if (!match) {
    return toDateOrNull(value);
  }

  const [, day, month, year] = match;
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}
