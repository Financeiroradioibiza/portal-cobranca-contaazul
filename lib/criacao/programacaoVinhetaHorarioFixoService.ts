import type { VinhetaHorarioFixoTipo } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type VinhetaHorarioFixoView = {
  id: string;
  tipo: VinhetaHorarioFixoTipo;
  hora: string;
  ativo: boolean;
  vinhetaId: string | null;
  vinhetaNome: string | null;
};

const HORA = /^\d{2}:\d{2}$/;

export async function listVinhetasHorarioFixo(programacaoId: string): Promise<VinhetaHorarioFixoView[]> {
  const rows = await prisma.programacaoVinhetaHorarioFixo.findMany({
    where: { programacaoId },
    orderBy: { tipo: "asc" },
    include: { vinheta: { select: { id: true, nome: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    hora: r.hora,
    ativo: r.ativo,
    vinhetaId: r.vinhetaId,
    vinhetaNome: r.vinheta?.nome ?? null,
  }));
}

export async function upsertVinhetaHorarioFixo(
  programacaoId: string,
  tipo: VinhetaHorarioFixoTipo,
  patch: { hora?: string; vinhetaId?: string | null; ativo?: boolean },
): Promise<VinhetaHorarioFixoView> {
  const hora = typeof patch.hora === "string" && HORA.test(patch.hora) ? patch.hora : "09:00";
  let vinhetaId: string | null | undefined = patch.vinhetaId;
  if (vinhetaId) {
    const ok = await prisma.vinheta.findFirst({
      where: { id: vinhetaId, programacaoId },
      select: { id: true },
    });
    if (!ok) throw new Error("vinheta_fora_da_programacao");
  } else if (patch.vinhetaId === null) {
    vinhetaId = null;
  }

  const row = await prisma.programacaoVinhetaHorarioFixo.upsert({
    where: { programacaoId_tipo: { programacaoId, tipo } },
    create: {
      programacaoId,
      tipo,
      hora,
      ativo: patch.ativo ?? false,
      vinhetaId: vinhetaId ?? null,
    },
    update: {
      ...(patch.hora !== undefined ? { hora } : {}),
      ...(patch.vinhetaId !== undefined ? { vinhetaId: vinhetaId ?? null } : {}),
      ...(patch.ativo !== undefined ? { ativo: patch.ativo } : {}),
    },
    include: { vinheta: { select: { id: true, nome: true } } },
  });

  return {
    id: row.id,
    tipo: row.tipo,
    hora: row.hora,
    ativo: row.ativo,
    vinhetaId: row.vinhetaId,
    vinhetaNome: row.vinheta?.nome ?? null,
  };
}

export async function deleteVinhetaHorarioFixo(programacaoId: string, tipo: VinhetaHorarioFixoTipo): Promise<void> {
  await prisma.programacaoVinhetaHorarioFixo.deleteMany({ where: { programacaoId, tipo } });
}

export async function listVinhetasHorarioFixoByProgramacaoIds(
  programacaoIds: string[],
): Promise<Map<string, VinhetaHorarioFixoView[]>> {
  const ids = [...new Set(programacaoIds.filter(Boolean))];
  const map = new Map<string, VinhetaHorarioFixoView[]>();
  if (ids.length === 0) return map;
  const rows = await prisma.programacaoVinhetaHorarioFixo.findMany({
    where: { programacaoId: { in: ids } },
    orderBy: [{ programacaoId: "asc" }, { tipo: "asc" }],
    include: { vinheta: { select: { id: true, nome: true } } },
  });
  for (const r of rows) {
    const view: VinhetaHorarioFixoView = {
      id: r.id,
      tipo: r.tipo,
      hora: r.hora,
      ativo: r.ativo,
      vinhetaId: r.vinhetaId,
      vinhetaNome: r.vinheta?.nome ?? null,
    };
    const list = map.get(r.programacaoId) ?? [];
    list.push(view);
    map.set(r.programacaoId, list);
  }
  return map;
}
