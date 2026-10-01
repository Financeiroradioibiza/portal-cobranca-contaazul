import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import { parseStringArrayJson, serializeStringArray } from "@/lib/chamados/chamadoUtils";
import {
  conversaDisplayTitulo,
  normalizeConversaSlug,
  resolveMentionEmails,
} from "@/lib/chamados/chamadoMentions";
import {
  createConversaAnexosForMensagem,
  conversaAnexoToView,
  type ConversaAnexoView,
} from "@/lib/chamados/chamadoAnexoService";
import { listChamadoParticipants, type ChamadoUserContext } from "@/lib/chamados/chamadoService";
import { scheduleConversaMentionEmails } from "@/lib/chamados/conversaNotifyEmail";
import { computeConversaUnreadMap } from "@/lib/chamados/conversaUnread";
import {
  loadEstadosForMensagens,
  loadReacoesForMensagens,
  type ConversaReacaoView,
} from "@/lib/chamados/conversaMessageService";

export type ConversaAssuntoView = {
  id: string;
  slug: string;
  titulo: string;
  display: string;
  tipo: "canal" | "cliente" | "prospect";
  clienteKey: string | null;
  clientePapel: string | null;
  criadoPorEmail: string;
  criadoPorNome: string;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  unreadGeneralCount: number;
  unreadMentionCount: number;
  mentionUnread: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
};

export type ConversaMensagemReplyPreview = {
  id: string;
  autorNome: string;
  corpo: string;
};

export type ConversaMensagemView = {
  id: string;
  assuntoId: string;
  corpo: string;
  mencoes: string[];
  autorEmail: string;
  autorNome: string;
  createdAt: string;
  anexos: ConversaAnexoView[];
  replyTo: ConversaMensagemReplyPreview | null;
  reacoes: ConversaReacaoView[];
  favorito: boolean;
  naoLida: boolean;
};

function assuntoDisplay(row: {
  slug: string;
  titulo: string;
  tipo: "canal" | "cliente" | "prospect";
}): string {
  if (row.tipo === "prospect") return row.titulo;
  if (row.tipo === "cliente") return row.titulo;
  return conversaDisplayTitulo(row.slug, row.titulo);
}

export function assuntoFromRow(
  row: {
    id: string;
    slug: string;
    titulo: string;
    tipo: "canal" | "cliente" | "prospect";
    clienteKey: string | null;
    clientePapel?: string | null;
    criadoPorEmail: string;
    criadoPorNome: string;
    createdAt: Date;
    updatedAt: Date;
  },
  unread: { unreadGeneral: number; unreadMention: number },
  last: { corpo: string; createdAt: Date } | undefined,
): ConversaAssuntoView {
  return {
    id: row.id,
    slug: row.slug,
    titulo: row.titulo,
    display: assuntoDisplay(row),
    tipo: row.tipo,
    clienteKey: row.clienteKey,
    clientePapel: row.clientePapel ?? null,
    criadoPorEmail: row.criadoPorEmail,
    criadoPorNome: row.criadoPorNome,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    unreadCount: unread.unreadGeneral + unread.unreadMention,
    unreadGeneralCount: unread.unreadGeneral,
    unreadMentionCount: unread.unreadMention,
    mentionUnread: unread.unreadMention > 0,
    lastMessageAt: last?.createdAt.toISOString() ?? null,
    lastMessagePreview: last?.corpo.trim().slice(0, 120) ?? null,
  };
}

export async function listConversaAssuntos(userEmail: string): Promise<ConversaAssuntoView[]> {
  const rows = await prisma.chamadoConversaAssunto.findMany({
    orderBy: [{ updatedAt: "desc" }],
  });
  const ids = rows.map((r) => r.id);
  const unreadMap = await computeConversaUnreadMap(ids, userEmail);

  const recentMsgs = await prisma.chamadoConversaMensagem.findMany({
    where: { assuntoId: { in: ids } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { assuntoId: true, corpo: true, createdAt: true },
  });
  const lastByAssunto = new Map<string, { corpo: string; createdAt: Date }>();
  for (const m of recentMsgs) {
    if (!lastByAssunto.has(m.assuntoId)) lastByAssunto.set(m.assuntoId, m);
  }

  return rows.map((r) => {
    const u = unreadMap.get(r.id) ?? { unreadGeneral: 0, unreadMention: 0 };
    return assuntoFromRow(r, u, lastByAssunto.get(r.id));
  });
}

export async function createConversaAssunto(
  input: { slug?: string; titulo: string },
  ctx: ChamadoUserContext,
): Promise<ConversaAssuntoView> {
  const slug = normalizeConversaSlug(input.slug?.trim() || input.titulo);
  if (!slug) throw new Error("slug_invalido");
  const titulo = input.titulo.trim().slice(0, 120) || slug;
  const row = await prisma.chamadoConversaAssunto.create({
    data: {
      slug,
      titulo,
      criadoPorEmail: ctx.email,
      criadoPorNome: ctx.displayName,
    },
  });
  return assuntoFromRow(row, { unreadGeneral: 0, unreadMention: 0 }, undefined);
}

export async function getConversaAssuntoBySlug(slugRaw: string): Promise<ConversaAssuntoView | null> {
  const slug = normalizeConversaSlug(slugRaw);
  const row = await prisma.chamadoConversaAssunto.findUnique({ where: { slug } });
  if (!row) return null;
  return assuntoFromRow(row, { unreadGeneral: 0, unreadMention: 0 }, undefined);
}

export async function listConversaMensagens(
  assuntoId: string,
  viewerEmail: string,
): Promise<ConversaMensagemView[]> {
  const email = normalizePortalEmail(viewerEmail);
  const rows = await prisma.chamadoConversaMensagem.findMany({
    where: { assuntoId },
    orderBy: { createdAt: "asc" },
    include: {
      anexos: { orderBy: { createdAt: "asc" } },
      replyTo: { select: { id: true, autorNome: true, corpo: true } },
    },
  });
  const ids = rows.map((r) => r.id);
  const [reacoesMap, estadosMap, leitura] = await Promise.all([
    loadReacoesForMensagens(ids, email),
    loadEstadosForMensagens(ids, email),
    prisma.chamadoConversaLeitura.findUnique({
      where: { assuntoId_userEmail: { assuntoId, userEmail: email } },
    }),
  ]);
  const lastRead = leitura?.lastReadAt ?? new Date(0);

  return rows.map((r) => {
    const st = estadosMap.get(r.id);
    const forcar = st?.forcarNaoLida ?? false;
    const naoLida =
      r.autorEmail.toLowerCase() !== email.toLowerCase() && (forcar || r.createdAt > lastRead);
    return {
      id: r.id,
      assuntoId: r.assuntoId,
      corpo: r.corpo,
      mencoes: parseStringArrayJson(r.mencoesJson),
      autorEmail: r.autorEmail,
      autorNome: r.autorNome,
      createdAt: r.createdAt.toISOString(),
      anexos: r.anexos.map(conversaAnexoToView),
      replyTo:
        r.replyTo ?
          {
            id: r.replyTo.id,
            autorNome: r.replyTo.autorNome,
            corpo: r.replyTo.corpo.trim().slice(0, 200),
          }
        : null,
      reacoes: reacoesMap.get(r.id) ?? [],
      favorito: st?.favorito ?? false,
      naoLida,
    };
  });
}

export async function postConversaMensagem(
  assuntoId: string,
  corpoRaw: string,
  ctx: ChamadoUserContext,
  files: { name: string; mimeType: string; bytes: Buffer }[],
  replyToMensagemId?: string | null,
): Promise<ConversaMensagemView> {
  const assunto = await prisma.chamadoConversaAssunto.findUnique({ where: { id: assuntoId } });
  if (!assunto) throw new Error("not_found");
  const corpo = corpoRaw.trim().slice(0, 12000);
  if (!corpo && files.length === 0) throw new Error("corpo_vazio");

  const participants = await listChamadoParticipants();
  const { mencoes } = resolveMentionEmails(corpo, participants);

  let replyId: string | null = null;
  if (replyToMensagemId?.trim()) {
    const parent = await prisma.chamadoConversaMensagem.findFirst({
      where: { id: replyToMensagemId.trim(), assuntoId },
    });
    if (parent) replyId = parent.id;
  }

  const row = await prisma.chamadoConversaMensagem.create({
    data: {
      assuntoId,
      corpo: corpo || "(anexo)",
      mencoesJson: serializeStringArray(mencoes),
      replyToMensagemId: replyId,
      autorEmail: ctx.email,
      autorNome: ctx.displayName,
    },
  });

  const anexos = files.length > 0 ? await createConversaAnexosForMensagem(row.id, files) : [];

  await prisma.chamadoConversaAssunto.update({
    where: { id: assuntoId },
    data: { updatedAt: new Date() },
  });

  scheduleConversaMentionEmails({
    assuntoSlug: assunto.slug,
    assuntoTitulo: assunto.titulo,
    autorNome: ctx.displayName,
    corpo,
    mencoes,
    excludeEmail: ctx.email,
  });

  const list = await listConversaMensagens(assuntoId, ctx.email);
  const hit = list.find((m) => m.id === row.id);
  if (hit) return hit;
  return {
    id: row.id,
    assuntoId: row.assuntoId,
    corpo: row.corpo,
    mencoes,
    autorEmail: row.autorEmail,
    autorNome: row.autorNome,
    createdAt: row.createdAt.toISOString(),
    anexos,
    replyTo: null,
    reacoes: [],
    favorito: false,
    naoLida: false,
  };
}

export async function markConversaRead(assuntoId: string, userEmail: string): Promise<void> {
  const email = normalizePortalEmail(userEmail);
  const now = new Date();
  await prisma.chamadoConversaLeitura.upsert({
    where: { assuntoId_userEmail: { assuntoId, userEmail: email } },
    create: { assuntoId, userEmail: email, lastReadAt: now },
    update: { lastReadAt: now },
  });
}

export async function searchConversas(qRaw: string): Promise<ConversaAssuntoView[]> {
  const q = qRaw.trim();
  if (!q) return [];
  const needle = q.toLowerCase();

  const assuntos = await prisma.chamadoConversaAssunto.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const matchedIds = new Set<string>();
  for (const a of assuntos) {
    if (
      a.slug.includes(needle) ||
      a.titulo.toLowerCase().includes(needle) ||
      conversaDisplayTitulo(a.slug, a.titulo).toLowerCase().includes(needle)
    ) {
      matchedIds.add(a.id);
    }
  }

  const msgHits = await prisma.chamadoConversaMensagem.findMany({
    where: {
      OR: [
        { corpo: { contains: q, mode: "insensitive" } },
        { autorNome: { contains: q, mode: "insensitive" } },
        { autorEmail: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { assuntoId: true },
    take: 100,
  });
  for (const m of msgHits) matchedIds.add(m.assuntoId);

  return assuntos
    .filter((a) => matchedIds.has(a.id))
    .slice(0, 40)
    .map((r) => assuntoFromRow(r, { unreadGeneral: 0, unreadMention: 0 }, undefined));
}

export async function totalConversaUnread(userEmail: string): Promise<number> {
  const list = await listConversaAssuntos(userEmail);
  return list.reduce((n, a) => n + a.unreadCount, 0);
}
