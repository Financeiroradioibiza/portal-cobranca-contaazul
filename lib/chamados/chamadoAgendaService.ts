import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import { chamadoToView } from "@/lib/chamados/chamadoUtils";
import type { ChamadoView } from "@/lib/chamados/chamadoTypes";
import { userParticipatesInChamado, getChamadoUserContext } from "@/lib/chamados/chamadoService";

export type ChamadoAgendaItem = ChamadoView & {
  prazoLabel: string;
  /** Etapa de sequência já fechada — exibir na grade em cinza. */
  agendaFinalizado?: boolean;
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

export async function listChamadosAgendaForUser(
  userEmail: string,
  fromIso: string,
  toIso: string,
): Promise<ChamadoAgendaItem[]> {
  const ctx = await getChamadoUserContext(userEmail);
  if (!ctx) return [];

  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];

  const rows = await prisma.chamado.findMany({
    where: {
      prazoEntrega: { gte: from, lte: to },
      OR: [
        { status: { in: ["aberto", "em_andamento", "aguardando"] } },
        { status: "fechado", sequenciaGrupoId: { not: null } },
      ],
    },
    orderBy: { prazoEntrega: "asc" },
  });

  const out: ChamadoAgendaItem[] = [];
  for (const row of rows) {
    if (!userParticipatesInChamado(row, ctx)) continue;
    const view = chamadoToView(row);
    if (!view.prazoEntrega) continue;
    const finalizado = row.status === "fechado" && Boolean(row.sequenciaGrupoId);
    out.push({
      ...view,
      prazoLabel: fmtPrazo(view.prazoEntrega),
      agendaFinalizado: finalizado,
    });
  }
  return out;
}

/** Fluxos em sequência criados por você — timeline completa quando algum prazo cai no período. */
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
      criadoPorEmail: ctx.email,
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
    if (sequenciaTotalmenteEncerrada(groupRows)) continue;

    const anyPrazoInRange = groupRows.some((r) => {
      if (!r.prazoEntrega) return false;
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
