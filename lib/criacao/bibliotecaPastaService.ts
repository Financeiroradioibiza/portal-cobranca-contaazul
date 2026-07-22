import { prisma } from "@/lib/prisma";
import { createTag } from "@/lib/criacao/tagService";
import { addMusicasToPasta, createPasta } from "@/lib/criacao/programacaoService";
import { resolveCriativoIniciais } from "@/lib/criacao/uploadTagService";
import { pickDefaultTagCor } from "@/lib/config/portalUserService";

export type BibliotecaPastaView = {
  id: string;
  nome: string;
  cor: string;
  icone: string;
  criativoUserId: string | null;
  criativoNome: string;
  criativoIniciais: string;
  musicaCount: number;
  sortOrder: number;
  createdAt: string;
};

const ICONES_VALIDOS = new Set([
  "folder",
  "music",
  "party",
  "sun",
  "star",
  "vinyl",
  "wave",
  "fire",
  "heart",
  "spark",
]);

function normalizeIcone(raw: string | undefined): string {
  const v = (raw ?? "folder").trim().toLowerCase();
  return ICONES_VALIDOS.has(v) ? v : "folder";
}

function mapPastaRow(
  p: {
    id: string;
    nome: string;
    cor: string;
    icone: string;
    criativoUserId: string | null;
    criativoNome: string;
    criativoIniciais: string;
    sortOrder: number;
    createdAt: Date;
    _count: { musicas: number };
  },
): BibliotecaPastaView {
  return {
    id: p.id,
    nome: p.nome,
    cor: p.cor,
    icone: p.icone,
    criativoUserId: p.criativoUserId,
    criativoNome: p.criativoNome,
    criativoIniciais: p.criativoIniciais,
    musicaCount: p._count.musicas,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function listBibliotecaPastas(): Promise<BibliotecaPastaView[]> {
  const rows = await prisma.bibliotecaPasta.findMany({
    orderBy: [{ sortOrder: "asc" }, { nome: "asc" }],
    include: { _count: { select: { musicas: true } } },
  });
  return rows.map(mapPastaRow);
}

export async function createBibliotecaPasta(input: {
  nome: string;
  cor?: string;
  icone?: string;
  criativoUserId: string;
  criativoNome: string;
  criativoIniciais?: string;
}): Promise<BibliotecaPastaView> {
  const nome = input.nome.trim().slice(0, 120);
  if (!nome) throw new Error("nome_obrigatorio");

  let cor = input.cor?.trim();
  const user = await prisma.portalUser.findUnique({
    where: { email: input.criativoUserId },
    select: { tagCor: true, tagIniciais: true },
  });
  if (!cor) {
    cor = user?.tagCor?.trim() || pickDefaultTagCor(input.criativoUserId);
  }

  const iniciais =
    input.criativoIniciais?.trim() ||
    resolveCriativoIniciais(user?.tagIniciais, input.criativoNome, input.criativoUserId);

  const maxOrder = await prisma.bibliotecaPasta.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

  const created = await prisma.bibliotecaPasta.create({
    data: {
      nome,
      cor: cor.startsWith("#") ? cor : `#${cor}`,
      icone: normalizeIcone(input.icone),
      criativoUserId: input.criativoUserId,
      criativoNome: input.criativoNome.slice(0, 120),
      criativoIniciais: iniciais.slice(0, 8),
      sortOrder,
    },
    include: { _count: { select: { musicas: true } } },
  });
  return mapPastaRow(created);
}

export async function updateBibliotecaPasta(
  id: string,
  patch: { nome?: string; cor?: string; icone?: string; sortOrder?: number },
): Promise<BibliotecaPastaView | null> {
  const data: {
    nome?: string;
    cor?: string;
    icone?: string;
    sortOrder?: number;
  } = {};
  if (typeof patch.nome === "string" && patch.nome.trim()) data.nome = patch.nome.trim().slice(0, 120);
  if (typeof patch.cor === "string" && patch.cor.trim()) {
    const c = patch.cor.trim();
    data.cor = c.startsWith("#") ? c : `#${c}`;
  }
  if (typeof patch.icone === "string") data.icone = normalizeIcone(patch.icone);
  if (typeof patch.sortOrder === "number" && Number.isFinite(patch.sortOrder)) {
    data.sortOrder = Math.trunc(patch.sortOrder);
  }
  if (Object.keys(data).length === 0) return null;

  const updated = await prisma.bibliotecaPasta.update({
    where: { id },
    data,
    include: { _count: { select: { musicas: true } } },
  });
  return mapPastaRow(updated);
}

export async function deleteBibliotecaPasta(id: string): Promise<void> {
  await prisma.bibliotecaPasta.delete({ where: { id } });
}

async function ensureFolderTag(pasta: {
  nome: string;
  cor: string;
  criativoUserId: string | null;
  criativoNome: string;
}): Promise<string> {
  const uid = pasta.criativoUserId ?? undefined;
  const existing = await prisma.tagCriativo.findFirst({
    where: { nome: pasta.nome, criativoUserId: uid ?? null },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await createTag({
    nome: pasta.nome,
    cor: pasta.cor,
    criativoUserId: uid,
    criativoNome: pasta.criativoNome,
  });
  return created.id;
}

/** Processa em lotes para não estourar timeout (Netlify) em arrastes grandes. */
const BIBLIOTECA_PASTA_MOVE_CHUNK = 80;

/** Adiciona faixas à pasta custom + tag adicional com o nome da pasta. */
export async function addMusicasToBibliotecaPasta(
  pastaId: string,
  musicaIds: string[],
): Promise<{ added: number; skipped: number }> {
  const ids = [...new Set(musicaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return { added: 0, skipped: 0 };

  const pasta = await prisma.bibliotecaPasta.findUnique({ where: { id: pastaId } });
  if (!pasta) throw new Error("pasta_nao_encontrada");

  const tagId = await ensureFolderTag(pasta);

  const validRows = await prisma.musicaBiblioteca.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const validSet = new Set(validRows.map((r) => r.id));
  const validIds = ids.filter((id) => validSet.has(id));
  if (validIds.length === 0) return { added: 0, skipped: ids.length };

  const existing = await prisma.bibliotecaPastaMusica.findMany({
    where: { pastaId, musicaId: { in: validIds } },
    select: { musicaId: true },
  });
  const jaTem = new Set(existing.map((e) => e.musicaId));
  const novos = validIds.filter((id) => !jaTem.has(id));

  if (novos.length === 0) return { added: 0, skipped: ids.length };

  const maxSort = await prisma.bibliotecaPastaMusica.aggregate({
    where: { pastaId },
    _max: { sortOrder: true },
  });
  const order = (maxSort._max.sortOrder ?? -1) + 1;

  await prisma.bibliotecaPastaMusica.createMany({
    data: novos.map((musicaId, i) => ({
      pastaId,
      musicaId,
      sortOrder: order + i,
    })),
    skipDuplicates: true,
  });

  await prisma.musicaTagManual.createMany({
    data: validIds.map((musicaId) => ({ musicaId, tagId })),
    skipDuplicates: true,
  });

  return { added: novos.length, skipped: ids.length - novos.length };
}

export async function removeMusicasFromBibliotecaPasta(
  pastaId: string,
  musicaIds: string[],
): Promise<number> {
  const ids = [...new Set(musicaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return 0;
  const res = await prisma.bibliotecaPastaMusica.deleteMany({
    where: { pastaId, musicaId: { in: ids } },
  });
  return res.count;
}

/** Move faixas entre pastas custom (remove da origem se informada). */
export async function moveMusicasEntreBibliotecaPastas(input: {
  dePastaId?: string | null;
  paraPastaId: string;
  musicaIds: string[];
}): Promise<{ added: number }> {
  const ids = [...new Set(input.musicaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return { added: 0 };

  let added = 0;
  for (let i = 0; i < ids.length; i += BIBLIOTECA_PASTA_MOVE_CHUNK) {
    const chunk = ids.slice(i, i + BIBLIOTECA_PASTA_MOVE_CHUNK);
    if (input.dePastaId && input.dePastaId !== input.paraPastaId) {
      await removeMusicasFromBibliotecaPasta(input.dePastaId, chunk);
    }
    const r = await addMusicasToBibliotecaPasta(input.paraPastaId, chunk);
    added += r.added;
  }
  return { added };
}

/** Copia faixas de pasta de programação ou especial para pasta custom (read-only source). */
export async function copyMusicasParaBibliotecaPastaFromSource(input: {
  paraPastaId: string;
  musicaIds: string[];
}): Promise<{ added: number }> {
  return addMusicasToBibliotecaPasta(input.paraPastaId, input.musicaIds);
}

async function musicaIdsFromBibliotecaPasta(bibliotecaPastaId: string): Promise<string[]> {
  const bib = await prisma.bibliotecaPasta.findUnique({
    where: { id: bibliotecaPastaId },
    include: { musicas: { orderBy: { sortOrder: "asc" }, select: { musicaId: true } } },
  });
  if (!bib) throw new Error("pasta_nao_encontrada");
  return bib.musicas.map((m) => m.musicaId);
}

/** Adiciona todas as faixas de uma pasta custom da biblioteca a uma pasta da programação. */
export async function addMusicasFromBibliotecaPastaToProgramacaoPasta(
  pastaProgramacaoId: string,
  bibliotecaPastaId: string,
): Promise<{ added: number; skipped: number; addedMusicaIds: string[] }> {
  const musicaIds = await musicaIdsFromBibliotecaPasta(bibliotecaPastaId);
  if (musicaIds.length === 0) return { added: 0, skipped: 0, addedMusicaIds: [] };

  const pasta = await prisma.pasta.findUnique({
    where: { id: pastaProgramacaoId },
    select: { programacaoId: true },
  });
  if (!pasta) throw new Error("pasta_programacao_nao_encontrada");

  const existentesNaProgramacao = await prisma.pastaMusica.findMany({
    where: {
      musicaId: { in: musicaIds },
      pasta: { programacaoId: pasta.programacaoId },
    },
    select: { musicaId: true },
  });
  const jaTem = new Set(existentesNaProgramacao.map((e) => e.musicaId));
  const validas = await prisma.musicaBiblioteca.findMany({
    where: { id: { in: musicaIds } },
    select: { id: true },
  });
  const validSet = new Set(validas.map((v) => v.id));
  const novos = musicaIds.filter((id) => validSet.has(id) && !jaTem.has(id));
  const added = await addMusicasToPasta(pastaProgramacaoId, musicaIds);
  return {
    added,
    skipped: musicaIds.length - added,
    addedMusicaIds: novos,
  };
}

/** Cria pasta na programação copiando nome e faixas de uma pasta custom da biblioteca. */
export async function createPastaFromBibliotecaCustom(
  programacaoId: string,
  bibliotecaPastaId: string,
  opts?: { nome?: string },
): Promise<{ pastaId: string; added: number; skipped: number; addedMusicaIds: string[] }> {
  const bib = await prisma.bibliotecaPasta.findUnique({
    where: { id: bibliotecaPastaId },
    include: { musicas: { orderBy: { sortOrder: "asc" }, select: { musicaId: true } } },
  });
  if (!bib) throw new Error("pasta_nao_encontrada");

  const nome = (opts?.nome?.trim() || bib.nome).trim();
  if (!nome) throw new Error("nome_obrigatorio");

  const pasta = await createPasta(programacaoId, { nome });
  const musicaIds = bib.musicas.map((m) => m.musicaId);
  if (musicaIds.length === 0) {
    return { pastaId: pasta.id, added: 0, skipped: 0, addedMusicaIds: [] };
  }

  const existentesNaProgramacao = await prisma.pastaMusica.findMany({
    where: {
      musicaId: { in: musicaIds },
      pasta: { programacaoId },
    },
    select: { musicaId: true },
  });
  const jaTem = new Set(existentesNaProgramacao.map((e) => e.musicaId));
  const validas = await prisma.musicaBiblioteca.findMany({
    where: { id: { in: musicaIds } },
    select: { id: true },
  });
  const validSet = new Set(validas.map((v) => v.id));
  const novos = musicaIds.filter((id) => validSet.has(id) && !jaTem.has(id));
  const added = await addMusicasToPasta(pasta.id, musicaIds);
  return {
    pastaId: pasta.id,
    added,
    skipped: musicaIds.length - added,
    addedMusicaIds: novos,
  };
}

export const BIBLIOTECA_PASTA_ICONES = [...ICONES_VALIDOS];

export function iconeBibliotecaPastaEmoji(icone: string): string {
  switch (icone) {
    case "music":
      return "🎵";
    case "party":
      return "🎉";
    case "sun":
      return "☀️";
    case "star":
      return "⭐";
    case "vinyl":
      return "💿";
    case "wave":
      return "🌊";
    case "fire":
      return "🔥";
    case "heart":
      return "❤️";
    case "spark":
      return "✨";
    default:
      return "📁";
  }
}
