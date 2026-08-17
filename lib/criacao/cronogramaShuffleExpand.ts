/** Meses 1–12 (janeiro = 1). Só lógica pura — player/cloud2 não usam. */

export const CRONOGRAMA_SHUFFLE_ANOS = 2;
export const CRONOGRAMA_SHUFFLE_ALERTA_MESES = 3;

export const MESES_CRONOGRAMA = [
  { n: 1, label: "Jan" },
  { n: 2, label: "Fev" },
  { n: 3, label: "Mar" },
  { n: 4, label: "Abr" },
  { n: 5, label: "Mai" },
  { n: 6, label: "Jun" },
  { n: 7, label: "Jul" },
  { n: 8, label: "Ago" },
  { n: 9, label: "Set" },
  { n: 10, label: "Out" },
  { n: 11, label: "Nov" },
  { n: 12, label: "Dez" },
] as const;

const TZ = "America/Sao_Paulo";

/** YYYY-MM-DD no fuso de São Paulo. */
export function todayBrYmd(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addYearsYmd(ymd: string, years: number): string {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  return `${y + years}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function normalizeMeses(meses: number[]): number[] {
  return [...new Set(meses.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))].sort(
    (a, b) => a - b,
  );
}

/** Gera períodos mensais dentro da janela [windowStartYmd, windowEndYmd]. */
export function expandShuffleMonthPeriods(
  meses: number[],
  windowStartYmd: string,
  windowEndYmd: string,
): Array<{ dataInicio: string; dataFim: string }> {
  const mesesSet = new Set(normalizeMeses(meses));
  if (mesesSet.size === 0) return [];

  const [sy, sm] = windowStartYmd.split("-").map((x) => parseInt(x, 10));
  const [ey, em] = windowEndYmd.split("-").map((x) => parseInt(x, 10));

  const out: Array<{ dataInicio: string; dataFim: string }> = [];
  let y = sy;
  let m = sm;

  while (y < ey || (y === ey && m <= em)) {
    if (mesesSet.has(m)) {
      const mm = String(m).padStart(2, "0");
      const dataInicio = `${y}-${mm}-01`;
      const dataFim = `${y}-${mm}-${String(lastDayOfMonth(y, m)).padStart(2, "0")}`;
      if (dataFim >= windowStartYmd && dataInicio <= windowEndYmd) {
        out.push({ dataInicio, dataFim });
      }
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  return out;
}

export function mesesCsvFromNumbers(meses: number[]): string {
  return normalizeMeses(meses).join(",");
}

export function mesesLabelsFromCsv(csv: string): string {
  const set = new Set(
    csv
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => n >= 1 && n <= 12),
  );
  return MESES_CRONOGRAMA.filter((m) => set.has(m.n))
    .map((m) => m.label)
    .join(", ");
}

export function mesesRestantesAte(expiraEmYmd: string, now = new Date()): number {
  const hoje = todayBrYmd(now);
  if (hoje >= expiraEmYmd) return 0;
  const [y1, m1] = hoje.split("-").map((x) => parseInt(x, 10));
  const [y2, m2] = expiraEmYmd.split("-").map((x) => parseInt(x, 10));
  let months = (y2 - y1) * 12 + (m2 - m1);
  const d1 = parseInt(hoje.split("-")[2]!, 10);
  const d2 = parseInt(expiraEmYmd.split("-")[2]!, 10);
  if (d2 > d1) months += 1;
  return Math.max(0, months);
}

export function shuffleExpirado(expiraEmYmd: string, now = new Date()): boolean {
  return todayBrYmd(now) > expiraEmYmd;
}
