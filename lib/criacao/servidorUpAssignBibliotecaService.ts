import { abrirAtualizacao } from "@/lib/criacao/atualizacaoService";
import { markCriativoEntregueAuto, markSubidaFilaPainel } from "@/lib/criacao/atualizacaoPainelService";
import { addMusicasToPasta } from "@/lib/criacao/programacaoService";
import { buildServidorUpPastaUploadTag } from "@/lib/criacao/servidorUpUploadTag";
import { assignTag } from "@/lib/criacao/tagService";
import { prisma } from "@/lib/prisma";

const DEFAULT_TAG_COR = "#6366f1";
const TAG_UPSERT_CHUNK = 20;

async function resolveTagId(input: {
  tagNome: string;
  criativoUserId: string | null;
  criativoNome: string;
  tagCache: Map<string, string>;
  userCor: string | null;
  userDisplayName: string | null;
}): Promise<string | null> {
  const nome = input.tagNome.trim().slice(0, 80);
  if (!nome) return null;

  const cached = input.tagCache.get(nome);
  if (cached) return cached;

  const corRaw = input.userCor?.trim() || DEFAULT_TAG_COR;
  const cor = corRaw.startsWith("#") ? corRaw.toLowerCase() : `#${corRaw.toLowerCase()}`;
  const criativoNome = (input.userDisplayName || input.criativoNome || input.criativoUserId || "").slice(
    0,
    120,
  );

  const existing = await prisma.tagCriativo.findFirst({
    where: { nome, criativoUserId: input.criativoUserId },
    select: { id: true },
  });

  const tagId =
    existing?.id ??
    (
      await prisma.tagCriativo.create({
        data: { nome, cor, criativoUserId: input.criativoUserId, criativoNome },
        select: { id: true },
      })
    ).id;

  if (existing) {
    await prisma.tagCriativo.update({
      where: { id: existing.id },
      data: { cor, criativoNome },
    });
  }

  input.tagCache.set(nome, tagId);
  return tagId;
}

async function applyTagsBatch(
  pairs: Array<{ musicaId: string; tagId: string }>,
): Promise<void> {
  const seen = new Set<string>();
  const unique: Array<{ musicaId: string; tagId: string }> = [];
  for (const p of pairs) {
    const key = `${p.musicaId}:${p.tagId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }
  for (let i = 0; i < unique.length; i += TAG_UPSERT_CHUNK) {
    const chunk = unique.slice(i, i + TAG_UPSERT_CHUNK);
    await Promise.all(chunk.map((p) => assignTag(p.musicaId, p.tagId)));
  }
}

export type ServidorUpAssignBibliotecaItem = {
  relativePath: string;
  musicaId: string;
  pastaId: string;
  pastaNome: string;
  uploadTagNome?: string;
};

export type ServidorUpAssignBibliotecaResult = {
  ok: boolean;
  assigned: number;
  skipped: number;
  errors: string[];
  byPasta: Array<{ pastaId: string; pastaNome: string; count: number }>;
};

/** Coloca faixa existente na pasta alvo + tag — sem Deemix nem fila completa. */
export async function assignServidorUpBibliotecaTracks(input: {
  items: ServidorUpAssignBibliotecaItem[];
  uploaderEmail: string;
  uploaderDisplayName: string;
}): Promise<ServidorUpAssignBibliotecaResult> {
  const errors: string[] = [];
  let assigned = 0;
  let skipped = 0;
  const byPastaMap = new Map<string, { pastaNome: string; count: number }>();
  const tagCache = new Map<string, string>();

  const portalUser =
    input.uploaderEmail ?
      await prisma.portalUser.findUnique({
        where: { email: input.uploaderEmail },
        select: { tagCor: true, displayName: true },
      })
    : null;

  const byPasta = new Map<string, ServidorUpAssignBibliotecaItem[]>();
  for (const item of input.items) {
    if (!item.musicaId || !item.pastaId) {
      skipped++;
      continue;
    }
    const list = byPasta.get(item.pastaId) ?? [];
    list.push(item);
    byPasta.set(item.pastaId, list);
  }

  for (const [pastaId, group] of byPasta) {
    const pasta = await prisma.pasta.findUnique({
      where: { id: pastaId },
      select: { id: true, nome: true, programacaoId: true },
    });
    if (!pasta?.programacaoId) {
      errors.push(`pasta_invalida:${pastaId}`);
      skipped += group.length;
      continue;
    }

    const musicaIds = [...new Set(group.map((g) => g.musicaId))];
    const added = await addMusicasToPasta(pastaId, musicaIds);
    assigned += added;
    skipped += musicaIds.length - added;

    const pastaNome = group[0]?.pastaNome || pasta.nome;
    byPastaMap.set(pastaId, { pastaNome, count: (byPastaMap.get(pastaId)?.count ?? 0) + added });

    const tagPairs: Array<{ musicaId: string; tagId: string }> = [];
    for (const item of group) {
      const tagBase = (item.uploadTagNome ?? "").trim() || item.pastaNome || pasta.nome;
      const tagNome = buildServidorUpPastaUploadTag(tagBase);
      const tagId = await resolveTagId({
        tagNome,
        criativoUserId: input.uploaderEmail,
        criativoNome: input.uploaderDisplayName,
        tagCache,
        userCor: portalUser?.tagCor ?? null,
        userDisplayName: portalUser?.displayName ?? null,
      });
      if (tagId) tagPairs.push({ musicaId: item.musicaId, tagId });
    }
    await applyTagsBatch(tagPairs).catch(() => undefined);

    await abrirAtualizacao(pasta.programacaoId, input.uploaderDisplayName);
    await markCriativoEntregueAuto(pasta.programacaoId, input.uploaderDisplayName);
    await markSubidaFilaPainel(pasta.programacaoId, `assign:${pastaId}:${Date.now()}`, input.uploaderDisplayName);
  }

  return {
    ok: errors.length === 0,
    assigned,
    skipped,
    errors: errors.slice(0, 10),
    byPasta: [...byPastaMap.entries()].map(([pastaId, v]) => ({ pastaId, ...v })),
  };
}
