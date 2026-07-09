import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProducaoCatalogLayout } from "@/lib/cadastros/producaoLayoutService";

export type MusicaVotoTipo = "like" | "dislike";

export type MusicaVotoRow = {
  id: string;
  portalClienteId: number;
  portalPdvId: number;
  pdvNome: string;
  clienteNome: string;
  voto: MusicaVotoTipo;
  createdAt: string;
};

export type MusicaVotoCounts = {
  likes: number;
  dislikes: number;
};

function isVotoTableMissing(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2021") return true;
    if (err.code === "P2022") return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /musica_biblioteca_voto/i.test(msg) && /does not exist|não existe|relation/i.test(msg);
}

function emptyCountsMap(musicaIds: string[]): Map<string, MusicaVotoCounts> {
  const map = new Map<string, MusicaVotoCounts>();
  for (const id of musicaIds) map.set(id, { likes: 0, dislikes: 0 });
  return map;
}

function parseVoto(raw: string): MusicaVotoTipo | null {
  const v = raw.trim().toLowerCase();
  return v === "like" || v === "dislike" ? v : null;
}

export async function upsertMusicaVoto(input: {
  musicaId: string;
  portalClienteId: number;
  portalPdvId: number;
  pdvNome?: string;
  clienteNome?: string;
  voto: MusicaVotoTipo;
}): Promise<void> {
  const musicaId = input.musicaId.trim();
  if (!musicaId) throw new Error("musica_obrigatoria");
  if (!Number.isFinite(input.portalClienteId) || input.portalClienteId <= 0) {
    throw new Error("cliente_invalido");
  }
  if (!Number.isFinite(input.portalPdvId) || input.portalPdvId <= 0) {
    throw new Error("pdv_invalido");
  }

  await prisma.musicaBibliotecaVoto.upsert({
    where: {
      musicaId_portalPdvId: { musicaId, portalPdvId: input.portalPdvId },
    },
    create: {
      musicaId,
      portalClienteId: input.portalClienteId,
      portalPdvId: input.portalPdvId,
      pdvNome: (input.pdvNome ?? "").slice(0, 200),
      clienteNome: (input.clienteNome ?? "").slice(0, 200),
      voto: input.voto,
    },
    update: {
      portalClienteId: input.portalClienteId,
      pdvNome: (input.pdvNome ?? "").slice(0, 200),
      clienteNome: (input.clienteNome ?? "").slice(0, 200),
      voto: input.voto,
    },
  });
}

export async function listVotosMusica(
  musicaId: string,
  portalPdvIds?: number[],
): Promise<MusicaVotoRow[]> {
  const where =
    portalPdvIds && portalPdvIds.length > 0 ?
      { musicaId, portalPdvId: { in: portalPdvIds } }
    : { musicaId };

  const rows = await prisma.musicaBibliotecaVoto.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
  }).catch((err) => {
    if (isVotoTableMissing(err)) return [];
    throw err;
  });

  return rows
    .map((r) => {
      const voto = parseVoto(r.voto);
      if (!voto) return null;
      return {
        id: r.id,
        portalClienteId: r.portalClienteId,
        portalPdvId: r.portalPdvId,
        pdvNome: r.pdvNome,
        clienteNome: r.clienteNome,
        voto,
        createdAt: r.updatedAt.toISOString(),
      } satisfies MusicaVotoRow;
    })
    .filter((r): r is MusicaVotoRow => r != null);
}

export async function countVotosPorMusica(musicaIds: string[]): Promise<Map<string, MusicaVotoCounts>> {
  if (musicaIds.length === 0) return new Map();

  try {
    const rows = await prisma.musicaBibliotecaVoto.groupBy({
      by: ["musicaId", "voto"],
      where: { musicaId: { in: musicaIds } },
      _count: { _all: true },
    });

    const map = emptyCountsMap(musicaIds);
    for (const r of rows) {
      const cur = map.get(r.musicaId) ?? { likes: 0, dislikes: 0 };
      const voto = parseVoto(r.voto);
      const n = r._count._all;
      if (voto === "like") cur.likes += n;
      else if (voto === "dislike") cur.dislikes += n;
      map.set(r.musicaId, cur);
    }
    return map;
  } catch (err) {
    if (isVotoTableMissing(err)) return emptyCountsMap(musicaIds);
    throw err;
  }
}

export async function countVotosPorMusicaFiltradoPdv(
  musicaIds: string[],
  portalPdvIds: number[],
): Promise<Map<string, MusicaVotoCounts>> {
  if (musicaIds.length === 0 || portalPdvIds.length === 0) return new Map();

  try {
    const rows = await prisma.musicaBibliotecaVoto.groupBy({
      by: ["musicaId", "voto"],
      where: { musicaId: { in: musicaIds }, portalPdvId: { in: portalPdvIds } },
      _count: { _all: true },
    });

    const map = new Map<string, MusicaVotoCounts>();
    for (const r of rows) {
      const cur = map.get(r.musicaId) ?? { likes: 0, dislikes: 0 };
      const voto = parseVoto(r.voto);
      const n = r._count._all;
      if (voto === "like") cur.likes += n;
      else if (voto === "dislike") cur.dislikes += n;
      map.set(r.musicaId, cur);
    }
    return map;
  } catch (err) {
    if (isVotoTableMissing(err)) return new Map();
    throw err;
  }
}

/** PDVs do gateway (100.001…) vinculados a uma programação via cadastro produção. */
export async function portalPdvIdsForProgramacao(programacaoId: string): Promise<number[]> {
  const pdvs = await prisma.producaoPdvCadastro.findMany({
    where: { programacaoId },
    select: { rioPdvKey: true },
  });
  if (pdvs.length === 0) return [];

  const layout = await getProducaoCatalogLayout();
  const map = layout.portalPdvIdsByRioPdvKey ?? {};
  const ids = new Set<number>();
  for (const p of pdvs) {
    const id = map[p.rioPdvKey];
    if (typeof id === "number" && Number.isFinite(id) && id > 0) ids.add(id);
  }
  return [...ids];
}
