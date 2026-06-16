import { currentBrazilYearMonth, formatYearMonthLabel, shiftYearMonth } from "@/lib/manualReminders/yearMonth";

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

export function brazilTodayYmd(d = new Date()): string {
  const { y, mo, dom } = brazilYmdParts(d);
  return `${y}-${String(mo).padStart(2, "0")}-${String(dom).padStart(2, "0")}`;
}

export function ymFirstDay(ym: number): string {
  const y = Math.floor(ym / 100);
  const mo = ym % 100;
  return `${y}-${String(mo).padStart(2, "0")}-01`;
}

export function ymLastDay(ym: number): string {
  const y = Math.floor(ym / 100);
  const mo = ym % 100;
  const lastDay = new Date(y, mo, 0).getDate();
  return `${y}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

export function dueYearMonth(due: string): number {
  const ymd = due.slice(0, 10);
  const [y, mo] = ymd.split("-").map(Number);
  if (!y || !mo) return 0;
  return y * 100 + mo;
}

export function dueInYearMonth(due: string, ym: number): boolean {
  return dueYearMonth(due) === ym;
}

export function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function ymdCompare(a: string, b: string): number {
  return a.slice(0, 10).localeCompare(b.slice(0, 10));
}

export function currentOverviewContext(ref = new Date()) {
  const ym = currentBrazilYearMonth(ref);
  const mesPassado = shiftYearMonth(ym, -1);
  const segundoMesPassado = shiftYearMonth(ym, -2);
  const terceiroMesPassado = shiftYearMonth(ym, -3);
  const mesSeguinte = shiftYearMonth(ym, 1);

  return {
    ym,
    today: brazilTodayYmd(ref),
    mesPassado,
    segundoMesPassado,
    terceiroMesPassado,
    mesSeguinte,
    /** Só os meses usados nos KPIs — busca paralela, bem menor que 12+ meses. */
    fetchMonths: [terceiroMesPassado, segundoMesPassado, mesPassado, ym, mesSeguinte],
    labelMesPassado: formatYearMonthLabel(mesPassado),
    labelSegundoMesPassado: formatYearMonthLabel(segundoMesPassado),
    labelTerceiroMesPassado: formatYearMonthLabel(terceiroMesPassado),
    labelMesSeguinte: formatYearMonthLabel(mesSeguinte),
    labelMesAtual: formatYearMonthLabel(ym),
  };
}
