import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { formatPortalPdvIdDisplay } from "@/lib/player/portalPlayerIds";
import { listPortalPlayerRows } from "@/lib/player/listPortalPlayerRows";
import { resolvePlayerAvisoPdvLabels } from "@/lib/suporte/playerAvisoPdvSearch";

export type PlayerAvisosAction = "listar" | "ativar" | "ativar_cliente" | "apagar" | "desativar";

/** Linha agrupada para a UI (um PDV ou todos PDVs de um cliente). */
export type PlayerAvisoListEntry = {
  scope: "pdv" | "cliente";
  /** `batch_id` ou id da linha única — usado em `desativar`. */
  deactivate_key: string;
  cliente_id: number;
  pdv_id: number | null;
  pdv_count: number;
  mensagem: string;
  atualizado_em: string;
  cliente_nome?: string;
  pdv_nome?: string;
  codigo_display?: string;
};

/** @deprecated use PlayerAvisoListEntry */
export type PlayerAvisoRow = PlayerAvisoListEntry;

const MAX_MSG = 2000;
const MAX_ROWS = 800;

export function parsePortalPlayerNumericId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.trunc(raw);
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

async function listPortalPdvIdsForCliente(portalClienteId: number): Promise<number[]> {
  const { rows } = await listPortalPlayerRows();
  const ids = new Set<number>();
  for (const r of rows) {
    const link = r.portalPlayerId;
    if (link && link.portalClienteId === portalClienteId) {
      ids.add(link.portalPdvId);
    }
  }
  return [...ids];
}

async function resolveClienteNome(portalClienteId: number): Promise<string | undefined> {
  const { rows } = await listPortalPlayerRows();
  for (const r of rows) {
    if (r.portalPlayerId?.portalClienteId === portalClienteId) {
      return r.clienteNome.trim() || undefined;
    }
  }
  return undefined;
}

async function trimExcessRows(): Promise<void> {
  const count = await prisma.playerAvisoOperador.count();
  if (count <= MAX_ROWS) return;
  const excess = await prisma.playerAvisoOperador.findMany({
    orderBy: { createdAt: "asc" },
    take: count - MAX_ROWS,
    select: { id: true },
  });
  if (excess.length === 0) return;
  await prisma.playerAvisoOperador.deleteMany({
    where: { id: { in: excess.map((e) => e.id) } },
  });
}

export async function listPlayerAvisoEntries(): Promise<PlayerAvisoListEntry[]> {
  const rows = await prisma.playerAvisoOperador.findMany({
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
  });

  const labels = await resolvePlayerAvisoPdvLabels(
    rows.map((r) => ({ portalClienteId: r.portalClienteId, portalPdvId: r.portalPdvId })),
  );

  const batchGroups = new Map<string, typeof rows>();
  const singles: typeof rows = [];

  for (const r of rows) {
    if (r.batchId) {
      const group = batchGroups.get(r.batchId) ?? [];
      group.push(r);
      batchGroups.set(r.batchId, group);
    } else {
      singles.push(r);
    }
  }

  const entries: PlayerAvisoListEntry[] = [];

  for (const [batchId, group] of batchGroups) {
    const first = group[0]!;
    const label = labels.get(first.portalPdvId);
    entries.push({
      scope: "cliente",
      deactivate_key: batchId,
      cliente_id: first.portalClienteId,
      pdv_id: null,
      pdv_count: group.length,
      mensagem: first.mensagem.trim(),
      atualizado_em: first.createdAt.toISOString(),
      cliente_nome: label?.clienteNome ?? (await resolveClienteNome(first.portalClienteId)),
    });
  }

  for (const r of singles) {
    const label = labels.get(r.portalPdvId);
    entries.push({
      scope: "pdv",
      deactivate_key: r.id,
      cliente_id: r.portalClienteId,
      pdv_id: r.portalPdvId,
      pdv_count: 1,
      mensagem: r.mensagem.trim(),
      atualizado_em: r.createdAt.toISOString(),
      cliente_nome: label?.clienteNome,
      pdv_nome: label?.pdvNome,
      codigo_display: label?.codigoDisplay ?? formatPortalPdvIdDisplay(r.portalPdvId),
    });
  }

  entries.sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));
  return entries;
}

/** @deprecated use listPlayerAvisoEntries */
export async function listPlayerAvisoRows(): Promise<PlayerAvisoListEntry[]> {
  return listPlayerAvisoEntries();
}

export async function activatePlayerAviso(
  portalClienteId: number,
  portalPdvId: number,
  mensagem: string,
): Promise<PlayerAvisoListEntry[]> {
  const msg = mensagem.trim().slice(0, MAX_MSG);
  if (!msg) throw new Error("mensagem_vazia");

  await prisma.playerAvisoOperador.create({
    data: { portalClienteId, portalPdvId, mensagem: msg },
  });
  await trimExcessRows();
  return listPlayerAvisoEntries();
}

export async function activatePlayerAvisoForCliente(
  portalClienteId: number,
  mensagem: string,
): Promise<PlayerAvisoListEntry[]> {
  const msg = mensagem.trim().slice(0, MAX_MSG);
  if (!msg) throw new Error("mensagem_vazia");

  const pdvIds = await listPortalPdvIdsForCliente(portalClienteId);
  if (pdvIds.length === 0) throw new Error("cliente_sem_pdvs");

  const batchId = crypto.randomUUID();
  await prisma.playerAvisoOperador.createMany({
    data: pdvIds.map((portalPdvId) => ({
      portalClienteId,
      portalPdvId,
      mensagem: msg,
      batchId,
    })),
  });
  await trimExcessRows();
  return listPlayerAvisoEntries();
}

export async function deactivatePlayerAviso(deactivateKey: string): Promise<PlayerAvisoListEntry[]> {
  const key = deactivateKey.trim();
  if (!key) throw new Error("chave_invalida");

  const batchCount = await prisma.playerAvisoOperador.count({ where: { batchId: key } });
  if (batchCount > 0) {
    await prisma.playerAvisoOperador.deleteMany({ where: { batchId: key } });
    return listPlayerAvisoEntries();
  }

  const deleted = await prisma.playerAvisoOperador.deleteMany({ where: { id: key } });
  if (deleted.count === 0) throw new Error("aviso_nao_encontrado");
  return listPlayerAvisoEntries();
}

export async function deletePlayerAvisosForPair(
  portalClienteId: number,
  portalPdvId: number,
): Promise<PlayerAvisoListEntry[]> {
  await prisma.playerAvisoOperador.deleteMany({
    where: { portalClienteId, portalPdvId },
  });
  return listPlayerAvisoEntries();
}

export async function fetchPlayerAvisoMensagensForPdv(
  portalClienteId: number,
  portalPdvId: number,
): Promise<string[]> {
  const rows = await prisma.playerAvisoOperador.findMany({
    where: { portalClienteId, portalPdvId },
    orderBy: { createdAt: "desc" },
    select: { mensagem: true },
  });
  const out: string[] = [];
  for (const r of rows) {
    const m = r.mensagem.trim();
    if (m) out.push(m);
  }
  return out;
}
