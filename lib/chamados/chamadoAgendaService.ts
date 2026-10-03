import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import { chamadoToView, parseStringArrayJson } from "@/lib/chamados/chamadoUtils";
import type { ChamadoView } from "@/lib/chamados/chamadoTypes";
import {
  userParticipatesInChamado,
  getChamadoUserContext,
  type ChamadoUserContext,
} from "@/lib/chamados/chamadoService";
import {
  backfillChamadoAgendaVisivelDesde,
  chamadoAgendaVisivelNow,
  startOfDaySaoPaulo,
} from "@/lib/chamados/chamadoAgendaVisibility";

export type ChamadoAgendaItem = ChamadoView & {
  prazoLabel: string;
  /** Etapa de sequência já fechada — exibir na grade em cinza. */
  agendaFinalizado?: boolean;
  /** Aberto sem data — lista separada; usuário é criador ou responsável. */
  agendaSemPrazo?: boolean;
  /** Prazo no passado, ainda em aberto. */
  agendaAtrasado?: boolean;
};

function sequenciaTotalmenteEncerrada(rows: { status: string }[]): boolean {
  return rows.length > 0 && rows.every((r) => r.status === "fechado");
}

export type AgendaSequenciaPasso = {
  chamadoId: string;
  passo: number;
  total: number;
  rotulo: string | null;
  prazoLabel: string;
  prazoEntrega: string;
  status: string;
};

export type AgendaSequenciaTimeline = {
  grupoId: string;
  titulo: string;
  templateKind: string | null;
  passos: AgendaSequenciaPasso[];
};

function fmtPrazo(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function inclusiveRangeEnd(toIso: string): Date {
  const to = new Date(toIso);
  if (Number.isNaN(to.getTime())) return to;
  return new Date(to.getTime() - 1);
}

export async function listChamadosAgendaForUser(
  userEmail: string,
  fromIso: string,
  toIso: string,
  opts?: { includeFinalizados?: boolean },
): Promise<ChamadoAgendaItem[]> {
  const ctx = await getChamadoUserContext(userEmail);
  if (!ctx) return [];

  const from = new Date(fromIso);
  const toEnd = inclusiveRangeEnd(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(toEnd.getTime())) return [];

  const includeFinalizados = opts?.includeFinalizados !== false;

  await backfillChamadoAgendaVisivelDesde();

  const statusFilter = includeFinalizados ?
    undefined
  : { status: { in: ["aberto", "em_andamento", "aguardando"] as ("aberto" | "em_andamento" | "aguardando")[] } };

  const rows = await prisma.chamado.findMany({
    where: {
      prazoEntrega: { not: null, gte: from, lte: toEnd },
      ...(statusFilter ?? {}),
    },
    orderBy: { prazoEntrega: "asc" },
  });

  const out: ChamadoAgendaItem[] = [];
  for (const row of rows) {
    if (!userParticipatesInChamado(row, ctx)) continue;
    if (!chamadoAgendaVisivelNow(row)) continue;
    const view = chamadoToView(row);
    if (!view.prazoEntrega) continue;
    const finalizado = row.status === "fechado";
    if (!includeFinalizados && finalizado) continue;
    out.push({
      ...view,
      prazoLabel: fmtPrazo(view.prazoEntrega),
      agendaFinalizado: finalizado,
    });
  }
  return out;
}

/** Em aberto com prazo já passou — não entram na grade do mês atual, mas devem aparecer na agenda (mobile). */
export async function listChamadosAgendaAtrasadosForUser(userEmail: string): Promise<ChamadoAgendaItem[]> {
  const ctx = await getChamadoUserContext(userEmail);
  if (!ctx) return [];

  await backfillChamadoAgendaVisivelDesde();

  const startToday = startOfDaySaoPaulo(new Date());

  const rows = await prisma.chamado.findMany({
    where: {
      prazoEntrega: { not: null, lt: startToday },
      status: { in: ["aberto", "em_andamento", "aguardando"] },
    },
    orderBy: { prazoEntrega: "asc" },
    take: 120,
  });

  const out: ChamadoAgendaItem[] = [];
  for (const row of rows) {
    if (!userParticipatesInChamado(row, ctx)) continue;
    if (!chamadoAgendaVisivelNow(row)) continue;
    const view = chamadoToView(row);
    if (!view.prazoEntrega) continue;
    out.push({
      ...view,
      prazoLabel: fmtPrazo(view.prazoEntrega),
      agendaAtrasado: true,
    });
  }
  return out;
}

/** Chamados em aberto atribuídos a você (ou que você abriu) sem data de prazo — aparecem fora da grade. */
export async function listChamadosAgendaSemPrazoForUser(userEmail: string): Promise<ChamadoAgendaItem[]> {
  const ctx = await getChamadoUserContext(userEmail);
  if (!ctx) return [];

  await backfillChamadoAgendaVisivelDesde();

  const rows = await prisma.chamado.findMany({
    where: {
      prazoEntrega: null,
      status: { in: ["aberto", "em_andamento", "aguardando"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const out: ChamadoAgendaItem[] = [];
  for (const row of rows) {
    if (!userParticipatesInChamado(row, ctx)) continue;
    if (!chamadoAgendaVisivelNow(row)) continue;
    const view = chamadoToView(row);
    out.push({
      ...view,
      prazoLabel: "Sem prazo",
      agendaSemPrazo: true,
    });
  }
  return out;
}

function userSeesSequenciaTimeline(
  groupRows: Parameters<typeof userParticipatesInChamado>[0][],
  ctx: ChamadoUserContext,
): boolean {
  return groupRows.some((r) => userParticipatesInChamado(r, ctx));
}

/** Fluxos em sequência em que você participa (qualquer etapa) — timeline completa de todos os passos quando algum prazo cai no período. */
export async function listAgendaSequenciaTimelinesForUser(
  userEmail: string,
  fromIso: string,
  toIso: string,
): Promise<AgendaSequenciaTimeline[]> {
  const ctx = await getChamadoUserContext(userEmail);
  if (!ctx) return [];

  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];

  const rows = await prisma.chamado.findMany({
    where: {
      sequenciaGrupoId: { not: null },
    },
    orderBy: [{ sequenciaGrupoId: "asc" }, { sequenciaPasso: "asc" }],
  });

  const byGroup = new Map<string, typeof rows>();
  for (const row of rows) {
    const g = row.sequenciaGrupoId!;
    const list = byGroup.get(g) ?? [];
    list.push(row);
    byGroup.set(g, list);
  }

  const timelines: AgendaSequenciaTimeline[] = [];
  for (const [grupoId, groupRows] of byGroup) {
    if (!userSeesSequenciaTimeline(groupRows, ctx)) continue;
    if (sequenciaTotalmenteEncerrada(groupRows)) continue;

    const anyPrazoInRange = groupRows.some((r) => {
      if (!r.prazoEntrega) return false;
      if (!chamadoAgendaVisivelNow(r)) return false;
      const t = r.prazoEntrega.getTime();
      return t >= from.getTime() && t <= to.getTime();
    });
    if (!anyPrazoInRange) continue;

    const passos: AgendaSequenciaPasso[] = [];
    for (const r of groupRows) {
      if (!r.prazoEntrega) continue;
      passos.push({
        chamadoId: r.id,
        passo: r.sequenciaPasso ?? 0,
        total: r.sequenciaTotal ?? 0,
        rotulo: r.sequenciaRotulo,
        prazoLabel: fmtPrazo(r.prazoEntrega.toISOString()),
        prazoEntrega: r.prazoEntrega.toISOString(),
        status: r.status,
      });
    }
    if (passos.length === 0) continue;

    timelines.push({
      grupoId,
      titulo: groupRows[0]?.titulo ?? "",
      templateKind: groupRows[0]?.templateKind ?? null,
      passos,
    });
  }

  return timelines;
}

export function userEmailNormalized(email: string): string {
  return normalizePortalEmail(email);
}
