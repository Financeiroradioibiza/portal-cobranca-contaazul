import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import type { ChamadoView } from "@/lib/chamados/chamadoTypes";
import { resolveChamadoNotifyRecipients } from "@/lib/chamados/chamadoNotifyEmail";

export type ChamadoInboxKind = "created" | "updated" | "closed" | "comment";

async function recipientEmailsForChamado(
  chamado: Pick<ChamadoView, "setores" | "responsaveis" | "criadoPorEmail">,
  extraEmails?: string[],
): Promise<string[]> {
  return resolveChamadoNotifyRecipients({
    setores: chamado.setores,
    responsaveis: chamado.responsaveis,
    extraEmails: extraEmails ?? [chamado.criadoPorEmail],
  });
}

/** Incrementa não lidos para envolvidos (exceto quem gerou o evento). */
export async function bumpChamadoInbox(
  chamado: ChamadoView,
  opts: { kind: ChamadoInboxKind; actorEmail: string },
): Promise<void> {
  const actor = normalizePortalEmail(opts.actorEmail);
  const recipients = await recipientEmailsForChamado(chamado);
  const targets = recipients.filter((e) => e.toLowerCase() !== actor.toLowerCase());
  if (targets.length === 0) return;

  await prisma.$transaction(
    targets.map((userEmail) =>
      prisma.chamadoInboxUsuario.upsert({
        where: {
          userEmail_chamadoId: { userEmail, chamadoId: chamado.id },
        },
        create: { userEmail, chamadoId: chamado.id, unreadCount: 1 },
        update: { unreadCount: { increment: 1 } },
      }),
    ),
  );
}

export async function markChamadoRead(userEmailRaw: string, chamadoId: string): Promise<void> {
  const userEmail = normalizePortalEmail(userEmailRaw);
  await prisma.chamadoInboxUsuario.updateMany({
    where: { userEmail, chamadoId },
    data: { unreadCount: 0 },
  });
}

export async function inboxUnreadByChamadoId(userEmailRaw: string): Promise<Map<string, number>> {
  const userEmail = normalizePortalEmail(userEmailRaw);
  const rows = await prisma.chamadoInboxUsuario.findMany({
    where: { userEmail, unreadCount: { gt: 0 } },
    select: { chamadoId: true, unreadCount: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.chamadoId, r.unreadCount);
  return map;
}

export async function totalChamadoInboxUnread(userEmailRaw: string): Promise<number> {
  const userEmail = normalizePortalEmail(userEmailRaw);
  const agg = await prisma.chamadoInboxUsuario.aggregate({
    where: { userEmail, unreadCount: { gt: 0 } },
    _sum: { unreadCount: true },
  });
  return agg._sum.unreadCount ?? 0;
}

export function attachInboxToChamados(
  chamados: ChamadoView[],
  inbox: Map<string, number>,
): ChamadoView[] {
  return chamados.map((c) => ({
    ...c,
    unreadCount: inbox.get(c.id) ?? 0,
  }));
}

export function sortChamadosByInboxThenPriority(a: ChamadoView, b: ChamadoView): number {
  const ua = a.unreadCount ?? 0;
  const ub = b.unreadCount ?? 0;
  if (ub !== ua) return ub - ua;
  const PRI_WEIGHT: Record<string, number> = { urgente: 4, alta: 3, media: 2, baixa: 1 };
  const pw = (PRI_WEIGHT[b.prioridade] ?? 0) - (PRI_WEIGHT[a.prioridade] ?? 0);
  if (pw !== 0) return pw;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}
