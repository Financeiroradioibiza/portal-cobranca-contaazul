import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import {
  clienteCanalDisplay,
  clienteCanalSlug,
  inferClientePapelFromSlug,
  parseClientePapel,
  type ClienteConversaPapel,
} from "@/lib/chamados/conversaClienteCanais";
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

export type ConversaInboxClienteCanalRow = {
  papel: ClienteConversaPapel;
  label: string;
  assuntoId: string | null;
  assuntoSlug: string | null;
  unreadGeneral: number;
  unreadMention: number;
  lastMessagePreview: string | null;
};

export type ConversaInboxClienteRow = {
  clienteKey: string;
  nome: string;
  unreadGeneral: number;
  unreadMention: number;
  canais: ConversaInboxClienteCanalRow[];
};

export type ConversaInboxView = {
  urgentes: ConversaInboxUrgenteItem[];
  minhasEnviadas: ConversaInboxMinhaEnviada[];
  canais: ConversaAssuntoView[];
  prospects: ConversaAssuntoView[];
  clientes: ConversaInboxClienteRow[];
};

function sortByUnreadThenName<T extends { unreadGeneral: number; unreadMention: number; nome?: string; display?: string }>(
  a: T,
  b: T,
): number {
  const ua = a.unreadGeneral + a.unreadMention;
  const ub = b.unreadGeneral + b.unreadMention;
  if (ub !== ua) return ub - ua;
  const na = a.nome ?? a.display ?? "";
  const nb = b.nome ?? b.display ?? "";
  return na.localeCompare(nb, "pt-BR");
}

function sortAssuntos(a: ConversaAssuntoView, b: ConversaAssuntoView): number {
  return sortByUnreadThenName(
    { unreadGeneral: a.unreadGeneralCount, unreadMention: a.unreadMentionCount, display: a.display },
    { unreadGeneral: b.unreadGeneralCount, unreadMention: b.unreadMentionCount, display: b.display },
  );
}

function assuntoDisplayForInbox(row: {
  slug: string;
  titulo: string;
  tipo: string;
  clienteKey: string | null;
  clientePapel: string | null;
}): string {
  if (row.tipo === "prospect") return row.titulo;
  if (row.tipo === "cliente" && row.clienteKey) {
    const papel = parseClientePapel(row.clientePapel) ?? inferClientePapelFromSlug(row.slug) ?? "sup";
    return clienteCanalDisplay(row.titulo.split(" · ")[0] ?? row.titulo, papel);
  }
  return conversaDisplayTitulo(row.slug, row.titulo);
}

function mapAssuntoRow(
  r: {
    id: string;
    slug: string;
    titulo: string;
    tipo: "canal" | "cliente" | "prospect";
    clienteKey: string | null;
    clientePapel: string | null;
    criadoPorEmail: string;
    criadoPorNome: string;
    createdAt: Date;
    updatedAt: Date;
  },
  unreadMap: Awaited<ReturnType<typeof computeConversaUnreadMap>>,
  lastByAssunto: Map<string, { corpo: string; createdAt: Date }>,
): ConversaAssuntoView {
  const u = unreadMap.get(r.id) ?? { unreadGeneral: 0, unreadMention: 0 };
  const last = lastByAssunto.get(r.id);
  const view = assuntoFromRow(r, u, last);
  if (r.tipo === "cliente" && r.clienteKey) {
    view.display = assuntoDisplayForInbox(r);
  }
  if (r.tipo === "prospect") {
    view.display = r.titulo;
  }
  return view;
}

export async function ensureConversaClienteCanal(
  clienteKey: string,
  papel: ClienteConversaPapel,
  ctx: ChamadoUserContext,
): Promise<ConversaAssuntoView> {
  const key = clienteKey.trim();
  if (!key) throw new Error("cliente_key_obrigatorio");
  if (papel !== "sup" && papel !== "mus") throw new Error("papel_invalido");

  const catalog = await listChamadoProducaoOpcoes();
  const hit = catalog.find((c) => c.key === key);
  if (!hit) throw new Error("cliente_nao_encontrado");

  const slug = clienteCanalSlug(key, papel);
  const titulo = `${hit.nome} · ${papel === "sup" ? "Suporte" : "Musical"}`.slice(0, 120);

  let row = await prisma.chamadoConversaAssunto.findUnique({ where: { slug } });
  if (!row) {
    row = await prisma.chamadoConversaAssunto.create({
      data: {
        slug,
        titulo,
        tipo: "cliente",
        clienteKey: key,
        clientePapel: papel,
        rioLinhaId: hit.rioLinhaId,
        criadoPorEmail: ctx.email,
        criadoPorNome: ctx.displayName,
      },
    });
  }

  const unreadMap = await computeConversaUnreadMap([row.id], ctx.email);
  const u = unreadMap.get(row.id) ?? { unreadGeneral: 0, unreadMention: 0 };
  return assuntoFromRow(row, u, undefined);
}

/** @deprecated Use ensureConversaClienteCanal(..., 'sup') */
export async function ensureConversaClienteAssunto(
  clienteKey: string,
  ctx: ChamadoUserContext,
): Promise<ConversaAssuntoView> {
  return ensureConversaClienteCanal(clienteKey, "sup", ctx);
}

export async function createConversaProspectAssunto(
  nomeRaw: string,
  ctx: ChamadoUserContext,
): Promise<ConversaAssuntoView> {
  const nome = nomeRaw.trim().slice(0, 120);
  if (!nome) throw new Error("nome_obrigatorio");
  const slug = normalizeConversaSlug(`prospect-${nome}`);
  if (!slug) throw new Error("slug_invalido");

  const existing = await prisma.chamadoConversaAssunto.findUnique({ where: { slug } });
  if (existing) {
    const unreadMap = await computeConversaUnreadMap([existing.id], ctx.email);
    const u = unreadMap.get(existing.id) ?? { unreadGeneral: 0, unreadMention: 0 };
    return assuntoFromRow(existing, u, undefined);
  }

  const row = await prisma.chamadoConversaAssunto.create({
    data: {
      slug,
      titulo: nome,
      tipo: "prospect",
      criadoPorEmail: ctx.email,
      criadoPorNome: ctx.displayName,
    },
  });
  return assuntoFromRow(row, { unreadGeneral: 0, unreadMention: 0 }, undefined);
}

export async function migrarProspectParaClienteCanal(
  prospectAssuntoId: string,
  clienteKey: string,
  papel: ClienteConversaPapel,
  ctx: ChamadoUserContext,
): Promise<{ destino: ConversaAssuntoView; mensagensMovidas: number }> {
  const prospect = await prisma.chamadoConversaAssunto.findUnique({ where: { id: prospectAssuntoId } });
  if (!prospect || prospect.tipo !== "prospect") throw new Error("prospect_nao_encontrado");

  const destino = await ensureConversaClienteCanal(clienteKey, papel, ctx);

  const moved = await prisma.chamadoConversaMensagem.updateMany({
    where: { assuntoId: prospect.id },
    data: { assuntoId: destino.id },
  });

  await prisma.chamadoConversaAssunto.delete({ where: { id: prospect.id } });

  return { destino, mensagensMovidas: moved.count };
}

export async function getConversaInbox(userEmail: string): Promise<ConversaInboxView> {
  const email = normalizePortalEmail(userEmail);

  const [assuntoRows, catalog, urgentesRaw, minhasRaw] = await Promise.all([
    prisma.chamadoConversaAssunto.findMany({ orderBy: { updatedAt: "desc" } }),
    listChamadoProducaoOpcoes(),
    prisma.chamadoConversaMsgEstado.findMany({
      where: { userEmail: email, favorito: true },
      include: { mensagem: { include: { assunto: true } } },
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

  const clienteCanalByKey = new Map<string, Map<ClienteConversaPapel, (typeof assuntoRows)[number]>>();
  for (const r of assuntoRows) {
    if (r.tipo !== "cliente" || !r.clienteKey) continue;
    let papel = parseClientePapel(r.clientePapel) ?? inferClientePapelFromSlug(r.slug);
    if (!papel) papel = "sup";
    if (!clienteCanalByKey.has(r.clienteKey)) clienteCanalByKey.set(r.clienteKey, new Map());
    clienteCanalByKey.get(r.clienteKey)!.set(papel, r);
  }

  const canais = assuntoRows
    .filter((r) => r.tipo === "canal")
    .map((r) => mapAssuntoRow(r, unreadMap, lastByAssunto))
    .sort(sortAssuntos);

  const prospects = assuntoRows
    .filter((r) => r.tipo === "prospect")
    .map((r) => mapAssuntoRow(r, unreadMap, lastByAssunto))
    .sort(sortAssuntos);

  const clientes: ConversaInboxClienteRow[] = catalog.map((c) => {
    const canaisMap = clienteCanalByKey.get(c.key);
    const papeis: ClienteConversaPapel[] = ["sup", "mus"];
    const canaisRows: ConversaInboxClienteCanalRow[] = papeis.map((papel) => {
      const row = canaisMap?.get(papel);
      const u =
        row ? (unreadMap.get(row.id) ?? { unreadGeneral: 0, unreadMention: 0 }) : { unreadGeneral: 0, unreadMention: 0 };
      const last = row ? lastByAssunto.get(row.id) : undefined;
      return {
        papel,
        label: clienteCanalDisplay(c.nome, papel),
        assuntoId: row?.id ?? null,
        assuntoSlug: row?.slug ?? null,
        unreadGeneral: u.unreadGeneral,
        unreadMention: u.unreadMention,
        lastMessagePreview: last?.corpo.trim().slice(0, 80) ?? null,
      };
    });
    const unreadGeneral = canaisRows.reduce((n, x) => n + x.unreadGeneral, 0);
    const unreadMention = canaisRows.reduce((n, x) => n + x.unreadMention, 0);
    return { clienteKey: c.key, nome: c.nome, unreadGeneral, unreadMention, canais: canaisRows };
  });
  clientes.sort((a, b) => sortByUnreadThenName(a, b));

  const urgentes: ConversaInboxUrgenteItem[] = urgentesRaw.map((e) => ({
    mensagemId: e.mensagemId,
    assuntoId: e.mensagem.assuntoId,
    assuntoDisplay: assuntoDisplayForInbox(e.mensagem.assunto),
    assuntoSlug: e.mensagem.assunto.slug,
    corpoPreview: e.mensagem.corpo.trim().slice(0, 100),
    autorNome: e.mensagem.autorNome,
    createdAt: e.mensagem.createdAt.toISOString(),
  }));

  const minhasEnviadas: ConversaInboxMinhaEnviada[] = minhasRaw.map((m) => ({
    mensagemId: m.id,
    assuntoId: m.assuntoId,
    assuntoDisplay: assuntoDisplayForInbox(m.assunto),
    assuntoSlug: m.assunto.slug,
    corpoPreview: m.corpo.trim().slice(0, 100),
    createdAt: m.createdAt.toISOString(),
  }));

  return { urgentes, minhasEnviadas, canais, prospects, clientes };
}
