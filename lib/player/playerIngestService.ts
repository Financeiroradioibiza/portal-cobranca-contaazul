import crypto from "node:crypto";
import type { PlayerIngestStatus, PlayerIngestTipo } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeStringArray } from "@/lib/chamados/chamadoService";

export type PlayerIngestView = {
  id: string;
  tipo: PlayerIngestTipo;
  status: PlayerIngestStatus;
  clienteGatewayId: number | null;
  clienteNome: string;
  pdvGatewayId: number | null;
  pdvNome: string;
  portalPdvId: number | null;
  rioPdvKey: string | null;
  mensagem: string;
  payload: Record<string, unknown>;
  chamadoId: string | null;
  conciliadoEm: string | null;
  createdAt: string;
  updatedAt: string;
};

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}") as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function rowToView(row: {
  id: string;
  tipo: PlayerIngestTipo;
  status: PlayerIngestStatus;
  clienteGatewayId: number | null;
  clienteNome: string;
  pdvGatewayId: number | null;
  pdvNome: string;
  portalPdvId: number | null;
  rioPdvKey: string | null;
  mensagem: string;
  payloadJson: string;
  chamadoId: string | null;
  conciliadoEm: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PlayerIngestView {
  return {
    id: row.id,
    tipo: row.tipo,
    status: row.status,
    clienteGatewayId: row.clienteGatewayId,
    clienteNome: row.clienteNome,
    pdvGatewayId: row.pdvGatewayId,
    pdvNome: row.pdvNome,
    portalPdvId: row.portalPdvId,
    rioPdvKey: row.rioPdvKey,
    mensagem: row.mensagem,
    payload: parsePayload(row.payloadJson),
    chamadoId: row.chamadoId,
    conciliadoEm: row.conciliadoEm?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function resolveRioPdvKeyFromPortalPdvId(portalPdvId: number): Promise<string | null> {
  const layout = await prisma.cadastroProducaoLayout.findFirst({
    orderBy: { yearMonth: "desc" },
    select: { portalPdvIdsByRioPdvKey: true },
  });
  if (!layout) return null;
  const map = layout.portalPdvIdsByRioPdvKey as Record<string, number> | null;
  if (!map || typeof map !== "object") return null;
  for (const [key, id] of Object.entries(map)) {
    if (Number(id) === portalPdvId) return key;
  }
  return null;
}

async function resolvePortalPdvIdFromGateway(pdvGatewayId: number | null): Promise<number | null> {
  if (pdvGatewayId == null || pdvGatewayId <= 0) return null;
  const link = await prisma.painelPdvLink.findUnique({
    where: { painelPdvId: pdvGatewayId },
    select: { rioCompPdv: { select: { portalPdvId: true } } },
  });
  return link?.rioCompPdv?.portalPdvId ?? pdvGatewayId;
}

async function createChamadoForFeedback(input: {
  clienteNome: string;
  pdvNome: string;
  mensagem: string;
  clienteId?: number | null;
  pdvId?: number | null;
}): Promise<string> {
  const titulo = `Feedback Player — ${input.clienteNome || "Cliente"}`.slice(0, 200);
  const linhas = [
    input.mensagem.trim(),
    "",
    "---",
    `Cliente: ${input.clienteNome || "—"}${input.clienteId != null ? ` (id ${input.clienteId})` : ""}`,
    `PDV: ${input.pdvNome || "—"}${input.pdvId != null ? ` (id ${input.pdvId})` : ""}`,
  ];
  const row = await prisma.chamado.create({
    data: {
      titulo,
      descricao: linhas.join("\n").slice(0, 8000),
      prioridade: "media",
      setoresJson: serializeStringArray(["relacionamento"]),
      responsaveisJson: serializeStringArray([]),
      criadoPorEmail: "player5@radioibiza.com.br",
      criadoPorNome: "Player 5",
    },
  });
  return row.id;
}

export async function ingestPlayerFeedback(input: {
  clienteNome: string;
  pdvNome: string;
  mensagem: string;
  clienteGatewayId?: number | null;
  pdvGatewayId?: number | null;
}): Promise<PlayerIngestView> {
  const mensagem = input.mensagem.trim().slice(0, 8000);
  if (mensagem.length < 5) throw new Error("mensagem_curta");

  const portalPdvId = await resolvePortalPdvIdFromGateway(input.pdvGatewayId ?? null);
  const rioPdvKey = portalPdvId ? await resolveRioPdvKeyFromPortalPdvId(portalPdvId) : null;
  const chamadoId = await createChamadoForFeedback({
    clienteNome: input.clienteNome,
    pdvNome: input.pdvNome,
    mensagem,
    clienteId: input.clienteGatewayId ?? null,
    pdvId: input.pdvGatewayId ?? null,
  });

  const row = await prisma.playerIngest.create({
    data: {
      id: crypto.randomUUID(),
      tipo: "feedback",
      status: "pendente",
      clienteGatewayId: input.clienteGatewayId ?? null,
      clienteNome: input.clienteNome.slice(0, 200),
      pdvGatewayId: input.pdvGatewayId ?? null,
      pdvNome: input.pdvNome.slice(0, 200),
      portalPdvId,
      rioPdvKey,
      mensagem,
      payloadJson: JSON.stringify({
        clienteGatewayId: input.clienteGatewayId ?? null,
        pdvGatewayId: input.pdvGatewayId ?? null,
      }),
      chamadoId,
    },
  });

  return rowToView(row);
}

export async function ingestPlayerCadastro(input: {
  clienteNome: string;
  pdvNome: string;
  clienteGatewayId?: number | null;
  pdvGatewayId?: number | null;
  payload: Record<string, unknown>;
}): Promise<PlayerIngestView> {
  const portalPdvId = await resolvePortalPdvIdFromGateway(input.pdvGatewayId ?? null);
  const rioPdvKey = portalPdvId ? await resolveRioPdvKeyFromPortalPdvId(portalPdvId) : null;

  const row = await prisma.playerIngest.create({
    data: {
      id: crypto.randomUUID(),
      tipo: "cadastro",
      status: "pendente",
      clienteGatewayId: input.clienteGatewayId ?? null,
      clienteNome: input.clienteNome.slice(0, 200),
      pdvGatewayId: input.pdvGatewayId ?? null,
      pdvNome: input.pdvNome.slice(0, 200),
      portalPdvId,
      rioPdvKey,
      mensagem: "",
      payloadJson: JSON.stringify(input.payload).slice(0, 12000),
    },
  });

  return rowToView(row);
}

export async function listPlayerIngest(opts: {
  tipo?: PlayerIngestTipo;
  status?: PlayerIngestStatus;
}): Promise<PlayerIngestView[]> {
  const rows = await prisma.playerIngest.findMany({
    where: {
      ...(opts.tipo ? { tipo: opts.tipo } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 200,
  });
  return rows.map(rowToView);
}

export async function getPlayerIngest(id: string): Promise<PlayerIngestView | null> {
  const row = await prisma.playerIngest.findUnique({ where: { id } });
  return row ? rowToView(row) : null;
}

const LOJA_PAYLOAD_ALIASES: Record<string, keyof import("@prisma/client").ProducaoPdvCadastro> = {
  contatoLojaNome: "contatoLojaNome",
  contato_loja_nome: "contatoLojaNome",
  gerente_loja: "contatoLojaNome",
  nome_gerente: "contatoLojaNome",
  nomeGerente: "contatoLojaNome",
  contatoLojaTelefone: "contatoLojaTelefone",
  contato_loja_telefone: "contatoLojaTelefone",
  whatsapp_loja: "contatoLojaTelefone",
  whatsappLoja: "contatoLojaTelefone",
  contatoLojaEmail: "contatoLojaEmail",
  contato_loja_email: "contatoLojaEmail",
  email_loja: "contatoLojaEmail",
  emailLoja: "contatoLojaEmail",
};

export const LOJA_CADASTRO_FIELDS = [
  "contatoLojaNome",
  "contatoLojaTelefone",
  "contatoLojaEmail",
] as const;

export type LojaCadastroField = (typeof LOJA_CADASTRO_FIELDS)[number];

export const LOJA_FIELD_LABELS: Record<LojaCadastroField, string> = {
  contatoLojaNome: "Nome do gerente da loja",
  contatoLojaTelefone: "WhatsApp da loja",
  contatoLojaEmail: "E-mail da loja",
};

/** Extrai só os 3 campos de contato da loja enviados pelo Player 5. */
export function extractLojaCadastroFromPayload(
  payload: Record<string, unknown>,
): Partial<Record<LojaCadastroField, string>> {
  const patch: Partial<Record<LojaCadastroField, string>> = {};
  for (const [srcKey, dbKey] of Object.entries(LOJA_PAYLOAD_ALIASES)) {
    const v = payload[srcKey];
    if (typeof v !== "string" || !v.trim()) continue;
    if (LOJA_CADASTRO_FIELDS.includes(dbKey as LojaCadastroField)) {
      patch[dbKey as LojaCadastroField] = v.trim();
    }
  }
  return patch;
}

export function lojaPayloadEntries(
  payload: Record<string, unknown>,
): Array<{ field: LojaCadastroField; label: string; value: string }> {
  const patch = extractLojaCadastroFromPayload(payload);
  return LOJA_CADASTRO_FIELDS.filter((f) => patch[f]?.trim()).map((field) => ({
    field,
    label: LOJA_FIELD_LABELS[field],
    value: patch[field]!.trim(),
  }));
}

const CADASTRO_FIELD_MAP: Record<string, keyof import("@prisma/client").ProducaoPdvCadastro> = {
  nome: "nome",
  cep: "cep",
  endereco: "endereco",
  numero: "numero",
  complemento: "complemento",
  bairro: "bairro",
  estado: "estado",
  cidade: "cidade",
  razaoSocial: "razaoSocial",
  razao_social: "razaoSocial",
  cnpj: "cnpj",
  contatoLojaNome: "contatoLojaNome",
  contato_loja_nome: "contatoLojaNome",
  contatoLojaEmail: "contatoLojaEmail",
  contato_loja_email: "contatoLojaEmail",
  contatoLojaTelefone: "contatoLojaTelefone",
  contato_loja_telefone: "contatoLojaTelefone",
  contatoCobrancaNome: "contatoCobrancaNome",
  contato_cobranca_nome: "contatoCobrancaNome",
  contatoCobrancaEmail: "contatoCobrancaEmail",
  contato_cobranca_email: "contatoCobrancaEmail",
  contatoCobrancaTelefone: "contatoCobrancaTelefone",
  contato_cobranca_telefone: "contatoCobrancaTelefone",
};

export async function conciliarPlayerCadastro(
  ingestId: string,
  ctx: { email: string; displayName: string },
): Promise<PlayerIngestView> {
  const ingest = await prisma.playerIngest.findUnique({ where: { id: ingestId } });
  if (!ingest) throw new Error("not_found");
  if (ingest.tipo !== "cadastro") throw new Error("tipo_invalido");
  if (ingest.status === "conciliado") throw new Error("ja_conciliado");

  const rioPdvKey = ingest.rioPdvKey?.trim();
  if (!rioPdvKey) throw new Error("pdv_nao_vinculado");

  const payload = parsePayload(ingest.payloadJson);
  const lojaPatch = extractLojaCadastroFromPayload(payload);

  if (Object.keys(lojaPatch).length === 0) throw new Error("payload_vazio");

  const { updatePdvCadastro } = await import("@/lib/cadastros/producaoPdvCadastroService");
  await updatePdvCadastro(rioPdvKey, lojaPatch);

  const { cloud2Enabled } = await import("@/lib/criacao/cloud2Client");
  if (cloud2Enabled()) {
    const { syncPlayerGatewayRegistry } = await import("@/lib/player/playerGatewaySync");
    await syncPlayerGatewayRegistry().catch(() => null);
  }

  const updated = await prisma.playerIngest.update({
    where: { id: ingestId },
    data: {
      status: "conciliado",
      conciliadoPorEmail: ctx.email,
      conciliadoPorNome: ctx.displayName,
      conciliadoEm: new Date(),
    },
  });

  return rowToView(updated);
}

/** Descarta atualização quando o cadastro atual já está correto. */
export async function arquivarPlayerIngest(
  ingestId: string,
  ctx: { email: string; displayName: string },
): Promise<PlayerIngestView> {
  const ingest = await prisma.playerIngest.findUnique({ where: { id: ingestId } });
  if (!ingest) throw new Error("not_found");
  if (ingest.status === "conciliado") throw new Error("ja_conciliado");
  if (ingest.status === "arquivado") throw new Error("ja_arquivado");

  const updated = await prisma.playerIngest.update({
    where: { id: ingestId },
    data: {
      status: "arquivado",
      conciliadoPorEmail: ctx.email,
      conciliadoPorNome: ctx.displayName,
      conciliadoEm: new Date(),
    },
  });

  return rowToView(updated);
}

export async function linkPlayerIngestRioPdvKey(
  ingestId: string,
  rioPdvKey: string,
): Promise<PlayerIngestView> {
  const key = rioPdvKey.trim();
  if (!key) throw new Error("rio_pdv_key_obrigatorio");

  const updated = await prisma.playerIngest.update({
    where: { id: ingestId },
    data: { rioPdvKey: key },
  });
  return rowToView(updated);
}
