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
  const today = brazilTodayYmd(ref);
  return {
    ym,
    today,
    mesPassado: shiftYearMonth(ym, -1),
    segundoMesPassado: shiftYearMonth(ym, -2),
    terceiroMesPassado: shiftYearMonth(ym, -3),
    mesSeguinte: shiftYearMonth(ym, 1),
    chartStartYm: shiftYearMonth(ym, -11),
    fetchStart: ymFirstDay(shiftYearMonth(ym, -11)),
    fetchEnd: ymLastDay(shiftYearMonth(ym, 1)),
    topDevedoresStart: ymFirstDay(shiftYearMonth(ym, -5)),
    labelMesPassado: formatYearMonthLabel(shiftYearMonth(ym, -1)),
    labelSegundoMesPassado: formatYearMonthLabel(shiftYearMonth(ym, -2)),
    labelTerceiroMesPassado: formatYearMonthLabel(shiftYearMonth(ym, -3)),
    labelMesSeguinte: formatYearMonthLabel(shiftYearMonth(ym, 1)),
    labelMesAtual: formatYearMonthLabel(ym),
  };
}

export function chartMonthsFrom(startYm: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(shiftYearMonth(startYm, i));
  return out;
}
