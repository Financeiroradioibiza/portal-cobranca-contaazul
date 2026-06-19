import { currentBrazilYearMonth } from "@/lib/manualReminders/yearMonth";

export type RioMonthPick = {
  yearMonth: number;
  closedAt?: string | Date | null;
};

function isMonthClosed(m: RioMonthPick): boolean {
  return m.closedAt != null && String(m.closedAt).length > 0;
}

/**
 * Competência Rio vigente para Planilha, Produção e Cadastros:
 * 1) competência aberta mais recente, se for posterior ao mês calendário (virada já aberta);
 * 2) mês calendário (Brasil), se existir na base e estiver aberto;
 * 3) senão a competência aberta mais recente;
 * 4) senão a mais recente cadastrada (mesmo fechada).
 */
export function pickVigenteRioYearMonth(
  months: RioMonthPick[],
  fallbackYm: number = currentBrazilYearMonth(),
): number {
  if (months.length === 0) return fallbackYm;

  const sorted = [...months].sort((a, b) => b.yearMonth - a.yearMonth);
  const open = sorted.filter((m) => !isMonthClosed(m));

  if (open.length === 0) return sorted[0]!.yearMonth;

  const newestOpenYm = open[0]!.yearMonth;
  if (newestOpenYm > fallbackYm) return newestOpenYm;

  const calendarOpen = open.find((m) => m.yearMonth === fallbackYm);
  if (calendarOpen) return calendarOpen.yearMonth;

  return newestOpenYm;
}
