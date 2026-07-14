import { prisma } from "@/lib/prisma";
import { assignTag, createTag } from "@/lib/criacao/tagService";
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

  const existing = await prisma.bibliotecaPastaMusica.findMany({
    where: { pastaId, musicaId: { in: ids } },
    select: { musicaId: true },
  });
  const jaTem = new Set(existing.map((e) => e.musicaId));
  const novos = ids.filter((id) => !jaTem.has(id));

  if (novos.length === 0) return { added: 0, skipped: ids.length };

  const maxSort = await prisma.bibliotecaPastaMusica.aggregate({
    where: { pastaId },
    _max: { sortOrder: true },
  });
  let order = (maxSort._max.sortOrder ?? -1) + 1;

  await prisma.$transaction(async (tx) => {
    for (const musicaId of novos) {
      await tx.bibliotecaPastaMusica.create({
        data: { pastaId, musicaId, sortOrder: order++ },
      });
    }
  });

  for (const musicaId of ids) {
    await assignTag(musicaId, tagId).catch(() => null);
  }

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

  if (input.dePastaId && input.dePastaId !== input.paraPastaId) {
    await removeMusicasFromBibliotecaPasta(input.dePastaId, ids);
  }

  const { added } = await addMusicasToBibliotecaPasta(input.paraPastaId, ids);
  return { added };
}

/** Copia faixas de pasta de programação ou especial para pasta custom (read-only source). */
export async function copyMusicasParaBibliotecaPastaFromSource(input: {
  paraPastaId: string;
  musicaIds: string[];
}): Promise<{ added: number }> {
  return addMusicasToBibliotecaPasta(input.paraPastaId, input.musicaIds);
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
