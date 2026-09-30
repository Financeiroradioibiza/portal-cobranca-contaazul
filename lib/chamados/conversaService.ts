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

export type ConversaAssuntoView = {
  id: string;
  slug: string;
  titulo: string;
  display: string;
  criadoPorEmail: string;
  criadoPorNome: string;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  mentionUnread: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
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
};

function assuntoBase(row: {
  id: string;
  slug: string;
  titulo: string;
  criadoPorEmail: string;
  criadoPorNome: string;
  createdAt: Date;
  updatedAt: Date;
}): Omit<ConversaAssuntoView, "unreadCount" | "mentionUnread" | "lastMessageAt" | "lastMessagePreview"> {
  return {
    id: row.id,
    slug: row.slug,
    titulo: row.titulo,
    display: conversaDisplayTitulo(row.slug, row.titulo),
    criadoPorEmail: row.criadoPorEmail,
    criadoPorNome: row.criadoPorNome,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function unreadForAssuntos(
  assuntoIds: string[],
  userEmail: string,
): Promise<Map<string, { unread: number; mentionUnread: boolean }>> {
  const email = normalizePortalEmail(userEmail);
  const out = new Map<string, { unread: number; mentionUnread: boolean }>();
  if (assuntoIds.length === 0) return out;

  const leituras = await prisma.chamadoConversaLeitura.findMany({
    where: { assuntoId: { in: assuntoIds }, userEmail: email },
  });
  const lastRead = new Map(leituras.map((l) => [l.assuntoId, l.lastReadAt]));

  const mensagens = await prisma.chamadoConversaMensagem.findMany({
    where: { assuntoId: { in: assuntoIds } },
    orderBy: { createdAt: "asc" },
    select: {
      assuntoId: true,
      autorEmail: true,
      createdAt: true,
      mencoesJson: true,
    },
  });

  for (const id of assuntoIds) {
    out.set(id, { unread: 0, mentionUnread: false });
  }

  for (const m of mensagens) {
    if (m.autorEmail.toLowerCase() === email.toLowerCase()) continue;
    const lr = lastRead.get(m.assuntoId) ?? new Date(0);
    if (m.createdAt <= lr) continue;
    const cur = out.get(m.assuntoId)!;
    cur.unread += 1;
    const mencoes = parseStringArrayJson(m.mencoesJson).map((x) => x.toLowerCase());
    if (mencoes.includes(email.toLowerCase())) cur.mentionUnread = true;
  }

  return out;
}

export async function listConversaAssuntos(userEmail: string): Promise<ConversaAssuntoView[]> {
  const rows = await prisma.chamadoConversaAssunto.findMany({
    orderBy: [{ updatedAt: "desc" }],
  });
  const ids = rows.map((r) => r.id);
  const unreadMap = await unreadForAssuntos(ids, userEmail);

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
    const u = unreadMap.get(r.id) ?? { unread: 0, mentionUnread: false };
    const last = lastByAssunto.get(r.id);
    return {
      ...assuntoBase(r),
      unreadCount: u.unread,
      mentionUnread: u.mentionUnread,
      lastMessageAt: last?.createdAt.toISOString() ?? null,
      lastMessagePreview: last?.corpo.trim().slice(0, 120) ?? null,
    };
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
  return {
    ...assuntoBase(row),
    unreadCount: 0,
    mentionUnread: false,
    lastMessageAt: null,
    lastMessagePreview: null,
  };
}

export async function getConversaAssuntoBySlug(slugRaw: string): Promise<ConversaAssuntoView | null> {
  const slug = normalizeConversaSlug(slugRaw);
  const row = await prisma.chamadoConversaAssunto.findUnique({ where: { slug } });
  if (!row) return null;
  return {
    ...assuntoBase(row),
    unreadCount: 0,
    mentionUnread: false,
    lastMessageAt: null,
    lastMessagePreview: null,
  };
}

export async function listConversaMensagens(assuntoId: string): Promise<ConversaMensagemView[]> {
  const rows = await prisma.chamadoConversaMensagem.findMany({
    where: { assuntoId },
    orderBy: { createdAt: "asc" },
    include: { anexos: { orderBy: { createdAt: "asc" } } },
  });
  return rows.map((r) => ({
    id: r.id,
    assuntoId: r.assuntoId,
    corpo: r.corpo,
    mencoes: parseStringArrayJson(r.mencoesJson),
    autorEmail: r.autorEmail,
    autorNome: r.autorNome,
    createdAt: r.createdAt.toISOString(),
    anexos: r.anexos.map(conversaAnexoToView),
  }));
}

export async function postConversaMensagem(
  assuntoId: string,
  corpoRaw: string,
  ctx: ChamadoUserContext,
  files: { name: string; mimeType: string; bytes: Buffer }[],
): Promise<ConversaMensagemView> {
  const assunto = await prisma.chamadoConversaAssunto.findUnique({ where: { id: assuntoId } });
  if (!assunto) throw new Error("not_found");
  const corpo = corpoRaw.trim().slice(0, 12000);
  if (!corpo && files.length === 0) throw new Error("corpo_vazio");

  const participants = await listChamadoParticipants();
  const { mencoes } = resolveMentionEmails(corpo, participants);

  const row = await prisma.chamadoConversaMensagem.create({
    data: {
      assuntoId,
      corpo: corpo || "(anexo)",
      mencoesJson: serializeStringArray(mencoes),
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

  return {
    id: row.id,
    assuntoId: row.assuntoId,
    corpo: row.corpo,
    mencoes,
    autorEmail: row.autorEmail,
    autorNome: row.autorNome,
    createdAt: row.createdAt.toISOString(),
    anexos,
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
    .map((r) => ({
      ...assuntoBase(r),
      unreadCount: 0,
      mentionUnread: false,
      lastMessageAt: null,
      lastMessagePreview: null,
    }));
}

export async function totalConversaUnread(userEmail: string): Promise<number> {
  const list = await listConversaAssuntos(userEmail);
  return list.reduce((n, a) => n + a.unreadCount, 0);
}
