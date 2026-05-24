/** Partes de data no fuso **America/Sao_Paulo** (financeiro Brasil). */
function brazilYmdParts(d = new Date()): { y: number; mo: number; dom: number } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [y, mo, dom] = s.split("-").map((x) => Number(x));
  return { y, mo, dom };
}

/** `YYYYMM` como inteiro (ex.: 202605), sempre em horário Brasil. */
export function currentBrazilYearMonth(d = new Date()): number {
  const { y, mo } = brazilYmdParts(d);
  return y * 100 + mo;
}

/** Dia do mês 1–31 no Brasil (para cruzar com `emissionDay`). */
export function currentBrazilDayOfMonth(d = new Date()): number {
  return brazilYmdParts(d).dom;
}

/** `YYYYMMDD` inteiro para idempotência (ex.: pedido OC automático no mesmo dia). */
export function currentBrazilYYYYMMDD(d = new Date()): number {
  const { y, mo, dom } = brazilYmdParts(d);
  return y * 10000 + mo * 100 + dom;
}

export function parseYearMonthParam(s: string): number | null {
  const t = String(s).trim();
  if (!/^\d{6}$/.test(t)) return null;
  const n = Number(t);
  const mo = n % 100;
  const y = Math.floor(n / 100);
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12) return null;
  return n;
}

const SHORT_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Rótulo curto tipo `mai/2026`. */
export function formatYearMonthLabel(ym: number): string {
  const mo = ym % 100;
  const y = Math.floor(ym / 100);
  const mon = SHORT_PT[mo - 1];
  return mon ? `${mon}/${y}` : String(ym);
}

export function shiftYearMonth(ym: number, deltaMonths: number): number {
  let y = Math.floor(ym / 100);
  let mIndex = (ym % 100) - 1 + deltaMonths;
  y += Math.floor(mIndex / 12);
  mIndex = ((mIndex % 12) + 12) % 12;
  return y * 100 + (mIndex + 1);
}

/**
 * Competência da faturagem no texto do e-mail de OC:
 * sempre o **mês civil anterior** ao relógio de **Brasil**, p.ex. envio em 1º de maio → `abr/2026`.
 */
export function formatPriorBrazilMonthBillingLabel(refDate = new Date()): string {
  const ym = currentBrazilYearMonth(refDate);
  return formatYearMonthLabel(shiftYearMonth(ym, -1));
}
