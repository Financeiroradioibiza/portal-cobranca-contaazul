/** Dias úteis (seg–sex) no fuso de São Paulo. */

const TZ = "America/Sao_Paulo";

function ymdInTz(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    d,
  );
}

function parseYmd(ymd: string): Date {
  const [y, m, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!, 12, 0, 0));
}

function weekdayUtc(d: Date): number {
  return d.getUTCDay();
}

function isBusinessDayUtc(d: Date): boolean {
  const w = weekdayUtc(d);
  return w >= 1 && w <= 5;
}

function addCalendarDaysUtc(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** Próximo dia útil estritamente após `from` (ou o próprio dia se for útil e includeSame). */
export function nextBusinessDay(from: Date, opts?: { includeSame?: boolean }): Date {
  let cur = parseYmd(ymdInTz(from));
  if (opts?.includeSame && isBusinessDayUtc(cur)) return cur;
  do {
    cur = addCalendarDaysUtc(cur, 1);
  } while (!isBusinessDayUtc(cur));
  return cur;
}

/** Conta dias úteis entre from e to (inclusive de to se útil). */
export function countBusinessDaysInclusive(from: Date, to: Date): number {
  let a = parseYmd(ymdInTz(from));
  const b = parseYmd(ymdInTz(to));
  if (b < a) return 0;
  let n = 0;
  while (a <= b) {
    if (isBusinessDayUtc(a)) n += 1;
    a = addCalendarDaysUtc(a, 1);
  }
  return n;
}

/** N prazos: 1 dia útil por etapa (cada prazo = próximo dia útil após o anterior). */
export function prazosUmDiaUtilPorEtapa(from: Date, etapas: number): Date[] {
  return prazosDiasUteisPorEtapa(from, etapas, 1);
}

/** Cada etapa avança `diasUteisPorEtapa` dias úteis (acumulado). */
export function prazosDiasUteisPorEtapa(from: Date, etapas: number, diasUteisPorEtapa: number): Date[] {
  const out: Date[] = [];
  let cur = parseYmd(ymdInTz(from));
  const n = Math.max(1, Math.floor(diasUteisPorEtapa));
  for (let i = 0; i < etapas; i++) {
    for (let d = 0; d < n; d++) {
      cur = nextBusinessDay(cur, { includeSame: false });
    }
    out.push(new Date(cur));
  }
  return out;
}

/** Divide dias úteis até dataInstalacao entre etapas (cada etapa recebe bloco contíguo). */
export function prazosDivididosAteInstalacao(from: Date, dataInstalacao: Date, etapas: number): Date[] {
  const start = parseYmd(ymdInTz(from));
  const end = parseYmd(ymdInTz(dataInstalacao));
  const total = countBusinessDaysInclusive(start, end);
  if (total <= 0 || etapas <= 0) return prazosUmDiaUtilPorEtapa(from, etapas);

  const per = Math.max(1, Math.floor(total / etapas));
  const out: Date[] = [];
  let cur = start;
  for (let i = 0; i < etapas; i++) {
    if (!isBusinessDayUtc(cur)) cur = nextBusinessDay(cur, { includeSame: true });
    let used = 0;
    const deadline = cur;
    while (used < per - 1) {
      cur = nextBusinessDay(cur, { includeSame: false });
      used += 1;
    }
    if (i < etapas - 1) {
      cur = nextBusinessDay(cur, { includeSame: false });
    } else {
      cur = end;
    }
    out.push(i === etapas - 1 ? end : deadline);
  }
  return out;
}

export function prazoToIsoDate(d: Date): string {
  return ymdInTz(d);
}

export function prazoEndOfDayUtc(ymd: string): Date {
  const [y, m, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!, 23, 59, 59));
}
