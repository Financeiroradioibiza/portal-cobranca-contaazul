import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import { parseStringArrayJson } from "@/lib/chamados/chamadoUtils";

export type ConversaUnreadBreakdown = {
  unreadGeneral: number;
  unreadMention: number;
};

export type ConversaUnreadMap = Map<string, ConversaUnreadBreakdown>;

export async function computeConversaUnreadMap(
  assuntoIds: string[],
  userEmail: string,
): Promise<ConversaUnreadMap> {
  const email = normalizePortalEmail(userEmail);
  const out: ConversaUnreadMap = new Map();
  if (assuntoIds.length === 0) return out;

  for (const id of assuntoIds) {
    out.set(id, { unreadGeneral: 0, unreadMention: 0 });
  }

  const leituras = await prisma.chamadoConversaLeitura.findMany({
    where: { assuntoId: { in: assuntoIds }, userEmail: email },
  });
  const lastRead = new Map(leituras.map((l) => [l.assuntoId, l.lastReadAt]));

  const mensagens = await prisma.chamadoConversaMensagem.findMany({
    where: { assuntoId: { in: assuntoIds } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      assuntoId: true,
      autorEmail: true,
      createdAt: true,
      mencoesJson: true,
    },
  });

  const msgIds = mensagens.map((m) => m.id);
  const estados =
    msgIds.length > 0
      ? await prisma.chamadoConversaMsgEstado.findMany({
          where: { mensagemId: { in: msgIds }, userEmail: email },
        })
      : [];
  const estadoByMsg = new Map(estados.map((e) => [e.mensagemId, e]));

  for (const m of mensagens) {
    if (m.autorEmail.toLowerCase() === email.toLowerCase()) continue;
    const lr = lastRead.get(m.assuntoId) ?? new Date(0);
    const st = estadoByMsg.get(m.id);
    const forcar = st?.forcarNaoLida ?? false;
    const isUnread = forcar || m.createdAt > lr;
    if (!isUnread) continue;

    const mencoes = parseStringArrayJson(m.mencoesJson).map((x) => x.toLowerCase());
    const mentioned = mencoes.includes(email.toLowerCase());
    const cur = out.get(m.assuntoId)!;
    if (mentioned) cur.unreadMention += 1;
    else cur.unreadGeneral += 1;
  }

  return out;
}

export function totalUnreadFromMap(map: ConversaUnreadMap): {
  general: number;
  mention: number;
} {
  let general = 0;
  let mention = 0;
  for (const v of map.values()) {
    general += v.unreadGeneral;
    mention += v.unreadMention;
  }
  return { general, mention };
}
