import { prisma } from "@/lib/prisma";
import { formatPortalPdvIdDisplay } from "@/lib/player/portalPlayerIds";
import { resolvePlayerAvisoPdvLabels } from "@/lib/suporte/playerAvisoPdvSearch";

export type PlayerAvisosAction = "listar" | "ativar" | "apagar";

export type PlayerAvisoRow = {
  cliente_id: number;
  pdv_id: number;
  mensagem: string;
  atualizado_em: string;
  cliente_nome?: string;
  pdv_nome?: string;
  codigo_display?: string;
};

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

function rowFromDb(r: {
  portalClienteId: number;
  portalPdvId: number;
  mensagem: string;
  createdAt: Date;
}): PlayerAvisoRow {
  return {
    cliente_id: r.portalClienteId,
    pdv_id: r.portalPdvId,
    mensagem: r.mensagem.trim(),
    atualizado_em: r.createdAt.toISOString(),
  };
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

export async function listPlayerAvisoRows(): Promise<PlayerAvisoRow[]> {
  const rows = await prisma.playerAvisoOperador.findMany({
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
  });
  const labels = await resolvePlayerAvisoPdvLabels(
    rows.map((r) => ({ portalClienteId: r.portalClienteId, portalPdvId: r.portalPdvId })),
  );
  return rows.map((r) => {
    const base = rowFromDb(r);
    const label = labels.get(r.portalPdvId);
    return {
      ...base,
      cliente_nome: label?.clienteNome,
      pdv_nome: label?.pdvNome,
      codigo_display: label?.codigoDisplay ?? formatPortalPdvIdDisplay(r.portalPdvId),
    };
  });
}

export async function activatePlayerAviso(
  portalClienteId: number,
  portalPdvId: number,
  mensagem: string,
): Promise<PlayerAvisoRow[]> {
  const msg = mensagem.trim().slice(0, MAX_MSG);
  if (!msg) throw new Error("mensagem_vazia");

  await prisma.playerAvisoOperador.create({
    data: { portalClienteId, portalPdvId, mensagem: msg },
  });
  await trimExcessRows();
  return listPlayerAvisoRows();
}

export async function deletePlayerAvisosForPair(
  portalClienteId: number,
  portalPdvId: number,
): Promise<PlayerAvisoRow[]> {
  await prisma.playerAvisoOperador.deleteMany({
    where: { portalClienteId, portalPdvId },
  });
  return listPlayerAvisoRows();
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
