import {
  chamadoVisivelDesdeDate,
  startOfDaySaoPaulo,
} from "@/lib/chamados/chamadoAgendaVisibility";

const PRAZO_TZ = "America/Sao_Paulo";

/** Chave YYYY-MM-DD (São Paulo) a partir de ISO. */
export function chamadoAgendaDayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PRAZO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function chamadoAgendaRangeDayKeys(row: {
  agendaVisivelDesde: string | null;
  createdAt: string;
  prazoEntrega: string | null;
}): { startKey: string; endKey: string } | null {
  if (!row.prazoEntrega) return null;
  const startKey = chamadoAgendaDayKey(
    (row.agendaVisivelDesde || row.createdAt).trim(),
  );
  const endKey = chamadoAgendaDayKey(row.prazoEntrega);
  return startKey <= endKey ? { startKey, endKey } : { startKey: endKey, endKey: startKey };
}

/** Intervalo [início, prazo] intersecta o período da grade (inclusive, dias SP). */
export function chamadoAgendaRangeOverlapsPeriod(
  row: {
    agendaVisivelDesde: Date | null;
    createdAt: Date;
    prazoEntrega: Date | null;
  },
  from: Date,
  toEnd: Date,
): boolean {
  if (!row.prazoEntrega) return false;
  const start = startOfDaySaoPaulo(chamadoVisivelDesdeDate(row));
  const end = startOfDaySaoPaulo(row.prazoEntrega);
  const fromDay = startOfDaySaoPaulo(from);
  const toDay = startOfDaySaoPaulo(toEnd);
  return start.getTime() <= toDay.getTime() && end.getTime() >= fromDay.getTime();
}
