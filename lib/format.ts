export function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const NON_DIGITS = /\D/g;

/** Só dígitos; vazio sem dígitos. */
export function onlyDigits(raw: string): string {
  return raw.replace(NON_DIGITS, "");
}

/**
 * CNPJ 14 dígitos — `07.900.208/0001-20`.
 * CPF 11 dígitos — formato usual.
 * Outros valores devolve trimmed original (ex.: já formatado estrangeiro ou "—").
 */
export function formatBrazilianTaxId(raw: string): string {
  const t = raw.trim();
  if (!t || t === "—") return t || "—";
  const d = onlyDigits(t);
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
  }
  return t;
}

/** Extrai todos os endereços de e-mail encontrados na string (vírgula, texto misto etc.). */
export function parseEmailAddresses(raw: string): string[] {
  if (!raw?.trim() || raw.trim() === "—") return [];
  const matches = [...raw.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((m) => m[0]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const em of matches) {
    const k = em.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(em);
  }
  return out;
}

export function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function defaultPeriodMonths(months: number) {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - months);
  return { start: toISODate(start), end: toISODate(end) };
}
