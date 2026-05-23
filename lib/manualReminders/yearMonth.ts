/** `YYYYMM` como inteiro (ex.: 202605). */
export function currentBrazilYearMonth(d = new Date()): number {
  return d.getFullYear() * 100 + (d.getMonth() + 1);
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
