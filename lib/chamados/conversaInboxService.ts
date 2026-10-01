import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import { listChamadoProducaoOpcoes } from "@/lib/chamados/chamadoProducaoOpcoes";
import type { ChamadoUserContext } from "@/lib/chamados/chamadoService";
import { conversaDisplayTitulo, normalizeConversaSlug } from "@/lib/chamados/chamadoMentions";
import { computeConversaUnreadMap } from "@/lib/chamados/conversaUnread";
import { assuntoFromRow, type ConversaAssuntoView } from "@/lib/chamados/conversaService";

export type ConversaInboxUrgenteItem = {
  mensagemId: string;
  assuntoId: string;
  assuntoDisplay: string;
  assuntoSlug: string;
  corpoPreview: string;
  autorNome: string;
  createdAt: string;
};

export type ConversaInboxMinhaEnviada = {
  mensagemId: string;
  assuntoId: string;
  assuntoDisplay: string;
  assuntoSlug: string;
  corpoPreview: string;
  createdAt: string;
};

export type ConversaInboxClienteRow = {
  clienteKey: string;
  nome: string;
  assuntoId: string | null;
  assuntoSlug: string | null;
  unreadGeneral: number;
  unreadMention: number;
  lastMessagePreview: string | null;
};

export type ConversaInboxView = {
  urgentes: ConversaInboxUrgenteItem[];
  minhasEnviadas: ConversaInboxMinhaEnviada[];
  canais: ConversaAssuntoView[];
  clientes: ConversaInboxClienteRow[];
};

function clienteSlugFromKey(key: string): string {
  return normalizeConversaSlug(`cliente-${key}`);
}

function sortCanais(a: ConversaAssuntoView, b: ConversaAssuntoView): number {
  const ua = a.unreadGeneralCount + a.unreadMentionCount;
  const ub = b.unreadGeneralCount + b.unreadMentionCount;
  if (ub !== ua) return ub - ua;
  return a.display.localeCompare(b.display, "pt-BR");
}

function sortClientes(a: ConversaInboxClienteRow, b: ConversaInboxClienteRow): number {
  const ua = a.unreadGeneral + a.unreadMention;
  const ub = b.unreadGeneral + b.unreadMention;
  if (ub !== ua) return ub - ua;
  return a.nome.localeCompare(b.nome, "pt-BR");
}

export async function ensureConversaClienteAssunto(
  clienteKey: string,
  ctx: ChamadoUserContext,
): Promise<ConversaAssuntoView> {
  const key = clienteKey.trim();
  if (!key) throw new Error("cliente_key_obrigatorio");

  const catalog = await listChamadoProducaoOpcoes();
  const hit = catalog.find((c) => c.key === key);
  if (!hit) throw new Error("cliente_nao_encontrado");

  const slug = clienteSlugFromKey(key);
  const existing = await prisma.chamadoConversaAssunto.findUnique({ where: { slug } });
  if (existing) {
    const unreadMap = await computeConversaUnreadMap([existing.id], ctx.email);
    const u = unreadMap.get(existing.id) ?? { unreadGeneral: 0, unreadMention: 0 };
    return assuntoFromRow(existing, u, undefined);
  }

  const row = await prisma.chamadoConversaAssunto.create({
    data: {
      slug,
      titulo: hit.nome.slice(0, 120),
      tipo: "cliente",
      clienteKey: key,
      rioLinhaId: hit.rioLinhaId,
      criadoPorEmail: ctx.email,
      criadoPorNome: ctx.displayName,
    },
  });

  return assuntoFromRow(row, { unreadGeneral: 0, unreadMention: 0 }, undefined);
}

export async function getConversaInbox(userEmail: string): Promise<ConversaInboxView> {
  const email = normalizePortalEmail(userEmail);

  const [assuntoRows, catalog, urgentesRaw, minhasRaw] = await Promise.all([
    prisma.chamadoConversaAssunto.findMany({ orderBy: { updatedAt: "desc" } }),
    listChamadoProducaoOpcoes(),
    prisma.chamadoConversaMsgEstado.findMany({
      where: { userEmail: email, favorito: true },
      include: {
        mensagem: {
          include: { assunto: true },
        },
      },
      orderBy: { mensagem: { createdAt: "desc" } },
      take: 40,
    }),
    prisma.chamadoConversaMensagem.findMany({
      where: { autorEmail: email },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { assunto: true },
    }),
  ]);

  const ids = assuntoRows.map((r) => r.id);
  const unreadMap = await computeConversaUnreadMap(ids, email);

  const recentMsgs = await prisma.chamadoConversaMensagem.findMany({
    where: { assuntoId: { in: ids } },
    orderBy: { createdAt: "desc" },
    take: 800,
    select: { assuntoId: true, corpo: true, createdAt: true },
  });
  const lastByAssunto = new Map<string, { corpo: string; createdAt: Date }>();
  for (const m of recentMsgs) {
    if (!lastByAssunto.has(m.assuntoId)) lastByAssunto.set(m.assuntoId, m);
  }

  const assuntoByClienteKey = new Map<string, (typeof assuntoRows)[number]>();
  for (const r of assuntoRows) {
    if (r.clienteKey) assuntoByClienteKey.set(r.clienteKey, r);
  }

  const canais: ConversaAssuntoView[] = assuntoRows
    .filter((r) => r.tipo === "canal")
    .map((r) => {
      const u = unreadMap.get(r.id) ?? { unreadGeneral: 0, unreadMention: 0 };
      const last = lastByAssunto.get(r.id);
      return {
        id: r.id,
        slug: r.slug,
        titulo: r.titulo,
        display: conversaDisplayTitulo(r.slug, r.titulo),
        tipo: "canal" as const,
        clienteKey: null,
        criadoPorEmail: r.criadoPorEmail,
        criadoPorNome: r.criadoPorNome,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        unreadCount: u.unreadGeneral + u.unreadMention,
        unreadGeneralCount: u.unreadGeneral,
        unreadMentionCount: u.unreadMention,
        mentionUnread: u.unreadMention > 0,
        lastMessageAt: last?.createdAt.toISOString() ?? null,
        lastMessagePreview: last?.corpo.trim().slice(0, 120) ?? null,
      };
    })
    .sort(sortCanais);

  const clientes: ConversaInboxClienteRow[] = catalog.map((c) => {
    const row = assuntoByClienteKey.get(c.key);
    const u = row ? (unreadMap.get(row.id) ?? { unreadGeneral: 0, unreadMention: 0 }) : { unreadGeneral: 0, unreadMention: 0 };
    const last = row ? lastByAssunto.get(row.id) : undefined;
    return {
      clienteKey: c.key,
      nome: c.nome,
      assuntoId: row?.id ?? null,
      assuntoSlug: row?.slug ?? null,
      unreadGeneral: u.unreadGeneral,
      unreadMention: u.unreadMention,
      lastMessagePreview: last?.corpo.trim().slice(0, 80) ?? null,
    };
  });
  clientes.sort(sortClientes);

  const urgentes: ConversaInboxUrgenteItem[] = urgentesRaw.map((e) => ({
    mensagemId: e.mensagemId,
    assuntoId: e.mensagem.assuntoId,
    assuntoDisplay:
      e.mensagem.assunto.tipo === "cliente"
        ? e.mensagem.assunto.titulo
        : conversaDisplayTitulo(e.mensagem.assunto.slug, e.mensagem.assunto.titulo),
    assuntoSlug: e.mensagem.assunto.slug,
    corpoPreview: e.mensagem.corpo.trim().slice(0, 100),
    autorNome: e.mensagem.autorNome,
    createdAt: e.mensagem.createdAt.toISOString(),
  }));

  const minhasEnviadas: ConversaInboxMinhaEnviada[] = minhasRaw.map((m) => ({
    mensagemId: m.id,
    assuntoId: m.assuntoId,
    assuntoDisplay:
      m.assunto.tipo === "cliente"
        ? m.assunto.titulo
        : conversaDisplayTitulo(m.assunto.slug, m.assunto.titulo),
    assuntoSlug: m.assunto.slug,
    corpoPreview: m.corpo.trim().slice(0, 100),
    createdAt: m.createdAt.toISOString(),
  }));

  return { urgentes, minhasEnviadas, canais, clientes };
}
