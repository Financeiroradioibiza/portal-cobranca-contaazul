import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import { chamadoToView } from "@/lib/chamados/chamadoUtils";
import type { ChamadoView } from "@/lib/chamados/chamadoTypes";
import { userParticipatesInChamado, getChamadoUserContext } from "@/lib/chamados/chamadoService";

export type ChamadoAgendaItem = ChamadoView & {
  prazoLabel: string;
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
      status: { in: ["aberto", "em_andamento", "aguardando"] },
    },
    orderBy: { prazoEntrega: "asc" },
  });

  const out: ChamadoAgendaItem[] = [];
  for (const row of rows) {
    if (!userParticipatesInChamado(row, ctx)) continue;
    const view = chamadoToView(row);
    if (!view.prazoEntrega) continue;
    out.push({ ...view, prazoLabel: fmtPrazo(view.prazoEntrega) });
  }
  return out;
}

export function userEmailNormalized(email: string): string {
  return normalizePortalEmail(email);
}
