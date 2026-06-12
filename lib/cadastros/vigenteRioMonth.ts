/** Competência Rio vigente = a mais recente na Planilha (lista em ordem desc). */
export function pickVigenteRioYearMonth(
  months: Array<{ yearMonth: number }>,
  fallbackYm: number,
): number {
  return months[0]?.yearMonth ?? fallbackYm;
}
