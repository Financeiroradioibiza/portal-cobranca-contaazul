import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pickLowestPreviewFormato } from "@/lib/criacao/previewFormato";
import { addMusicasToPasta, createPasta } from "@/lib/criacao/programacaoService";
import { buildPreviewUrl } from "@/lib/criacao/streamUrl";

const VELOCIDADES = new Set(["baixa", "media", "alta"]);

function isVelocidade(v: unknown): v is string {
  return typeof v === "string" && VELOCIDADES.has(v);
}

export type PastaEspecialMusicaView = {
  id: string;
  titulo: string;
  artista: string;
  durationMs: number | null;
  previewUrl: string | null;
  addedAt: string | null;
  tagsManuais: { id: string; nome: string; cor: string; criativoNome: string }[];
};

export type PastaEspecialView = {
  id: string;
  nome: string;
  velocidade: string;
  selecionavel: boolean;
  sortOrder: number;
  musicaCount: number;
  musicas?: PastaEspecialMusicaView[];
};

function mapMusicaLink(link: {
  addedAt: Date | null;
  musica: {
    id: string;
    titulo: string;
    artista: string;
    durationMs: number | null;
    versoes: { formato: string }[];
    tagsManuais: {
      tag: { id: string; nome: string; cor: string; criativoNome: string };
    }[];
  };
}): PastaEspecialMusicaView {
  const formato = pickLowestPreviewFormato(link.musica.versoes);
  return {
    id: link.musica.id,
    titulo: link.musica.titulo,
    artista: link.musica.artista,
    durationMs: link.musica.durationMs,
    previewUrl: formato ? buildPreviewUrl(link.musica.id, formato) : null,
    addedAt: link.addedAt?.toISOString() ?? null,
    tagsManuais: link.musica.tagsManuais.map((t) => ({
      id: t.tag.id,
      nome: t.tag.nome,
      cor: t.tag.cor,
      criativoNome: t.tag.criativoNome,
    })),
  };
}

const musicaInclude = {
  musica: {
    select: {
      id: true,
      titulo: true,
      artista: true,
      durationMs: true,
      versoes: { select: { formato: true } },
      tagsManuais: {
        include: {
          tag: { select: { id: true, nome: true, cor: true, criativoNome: true } },
        },
      },
    },
  },
} satisfies Prisma.PastaEspecialMusicaInclude;

export async function listPastasEspeciais(): Promise<PastaEspecialView[]> {
  const rows = await prisma.pastaEspecial.findMany({
    orderBy: [{ sortOrder: "asc" }, { nome: "asc" }],
    include: { _count: { select: { musicas: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    velocidade: r.velocidade,
    selecionavel: r.selecionavel,
    sortOrder: r.sortOrder,
    musicaCount: r._count.musicas,
  }));
}

export async function getPastaEspecial(id: string): Promise<PastaEspecialView | null> {
  const row = await prisma.pastaEspecial.findUnique({
    where: { id },
    include: {
      musicas: { orderBy: { sortOrder: "asc" }, include: musicaInclude },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    velocidade: row.velocidade,
    selecionavel: row.selecionavel,
    sortOrder: row.sortOrder,
    musicaCount: row.musicas.length,
    musicas: row.musicas.map(mapMusicaLink),
  };
}

export async function createPastaEspecial(input: {
  nome: string;
  velocidade?: string;
  selecionavel?: boolean;
}) {
  const nome = (input.nome || "").trim();
  if (!nome) throw new Error("nome_obrigatorio");
  const last = await prisma.pastaEspecial.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return prisma.pastaEspecial.create({
    data: {
      nome: nome.slice(0, 120),
      velocidade: isVelocidade(input.velocidade) ? input.velocidade : "media",
      selecionavel: input.selecionavel === true,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    select: { id: true },
  });
}

export async function updatePastaEspecial(
  id: string,
  patch: { nome?: string; velocidade?: string; selecionavel?: boolean },
): Promise<boolean> {
  const data: Prisma.PastaEspecialUpdateInput = {};
  if (typeof patch.nome === "string" && patch.nome.trim()) data.nome = patch.nome.trim().slice(0, 120);
  if (isVelocidade(patch.velocidade)) data.velocidade = patch.velocidade;
  if (typeof patch.selecionavel === "boolean") data.selecionavel = patch.selecionavel;
  if (Object.keys(data).length === 0) return false;
  await prisma.pastaEspecial.update({ where: { id }, data });
  return true;
}

export async function deletePastaEspecial(id: string): Promise<void> {
  await prisma.pastaEspecial.delete({ where: { id } });
}

export async function addMusicasToPastaEspecial(
  pastaEspecialId: string,
  musicaIds: string[],
): Promise<number> {
  const ids = Array.from(new Set(musicaIds.filter((x) => typeof x === "string" && x)));
  if (ids.length === 0) return 0;

  const [validas, existentes, last] = await Promise.all([
    prisma.musicaBiblioteca.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    prisma.pastaEspecialMusica.findMany({
      where: { pastaEspecialId, musicaId: { in: ids } },
      select: { musicaId: true },
    }),
    prisma.pastaEspecialMusica.findFirst({
      where: { pastaEspecialId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    }),
  ]);

  const validSet = new Set(validas.map((v) => v.id));
  const jaTem = new Set(existentes.map((e) => e.musicaId));
  const novos = ids.filter((id) => validSet.has(id) && !jaTem.has(id));
  if (novos.length === 0) return 0;

  let order = (last?.sortOrder ?? -1) + 1;
  const now = new Date();
  await prisma.pastaEspecialMusica.createMany({
    data: novos.map((musicaId) => ({
      pastaEspecialId,
      musicaId,
      sortOrder: order++,
      addedAt: now,
    })),
    skipDuplicates: true,
  });
  return novos.length;
}

export async function removeMusicasFromPastaEspecial(
  pastaEspecialId: string,
  musicaIds: string[],
): Promise<number> {
  const ids = Array.from(new Set(musicaIds.filter(Boolean)));
  if (ids.length === 0) return 0;
  const res = await prisma.pastaEspecialMusica.deleteMany({
    where: { pastaEspecialId, musicaId: { in: ids } },
  });
  return res.count;
}

/** Cria pasta na programação copiando nome, velocidade e faixas de uma pasta especial. */
export async function createPastaFromEspecial(
  programacaoId: string,
  pastaEspecialId: string,
): Promise<{ pastaId: string; added: number; skipped: number }> {
  const especial = await prisma.pastaEspecial.findUnique({
    where: { id: pastaEspecialId },
    include: { musicas: { orderBy: { sortOrder: "asc" }, select: { musicaId: true } } },
  });
  if (!especial) throw new Error("pasta_especial_nao_encontrada");

  const pasta = await createPasta(programacaoId, {
    nome: especial.nome,
    velocidade: especial.velocidade,
    selecionavel: especial.selecionavel,
  });

  const musicaIds = especial.musicas.map((m) => m.musicaId);
  const added = await addMusicasToPasta(pasta.id, musicaIds);
  return { pastaId: pasta.id, added, skipped: musicaIds.length - added };
}
