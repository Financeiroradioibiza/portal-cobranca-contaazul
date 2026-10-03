import { prisma } from "@/lib/prisma";

const PRAZO_TZ = "America/Sao_Paulo";

/** Início do dia civil em São Paulo (UTC Date). */
export function startOfDaySaoPaulo(d: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PRAZO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return new Date(`${y}-${m}-${day}T00:00:00-03:00`);
}

export function chamadoVisivelDesdeDate(row: {
  agendaVisivelDesde: Date | null;
  createdAt: Date;
}): Date {
  return row.agendaVisivelDesde ?? row.createdAt;
}

/** Chamado já entrou no período de visibilidade (agenda / badges / push). */
export function chamadoAgendaVisivelNow(row: {
  agendaVisivelDesde: Date | null;
  createdAt: Date;
  now?: Date;
}): boolean {
  const now = row.now ?? new Date();
  const vis = startOfDaySaoPaulo(chamadoVisivelDesdeDate(row));
  const today = startOfDaySaoPaulo(now);
  return vis.getTime() <= today.getTime();
}

/** Garante início preenchido no banco (legado sem migrate ou PATCH que zerou o campo). */
export async function backfillChamadoAgendaVisivelDesde(): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE chamado SET agenda_visivel_desde = created_at WHERE agenda_visivel_desde IS NULL
    `;
    /* Abertos antigos com “início” no futuro por engano — voltam a valer desde a abertura. */
    await prisma.$executeRaw`
      UPDATE chamado
      SET agenda_visivel_desde = created_at
      WHERE status IN ('aberto', 'em_andamento', 'aguardando')
        AND (
          agenda_visivel_desde IS NULL
          OR (
            agenda_visivel_desde > NOW()
            AND created_at < DATE_SUB(NOW(), INTERVAL 2 DAY)
          )
        )
    `;
  } catch (e) {
    console.error("[chamadoAgendaVisibility] backfill agenda_visivel_desde", e);
  }
}
