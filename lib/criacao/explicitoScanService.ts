import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  geniusLetraTagsChanged,
  mergeGeniusLetraCheck,
  needsGeniusLetraCheck,
} from "@/lib/criacao/explicitoGeniusCore";
import { lyricsContainProfanity } from "@/lib/criacao/explicitoProfanityFilter";
import { fetchGeniusLyrics, geniusEnabled } from "@/lib/criacao/geniusLyricsService";
import { parseTagsFromJson } from "@/lib/criacao/tagEnrichmentCore";

export const EXPLICITO_SCAN_BATCH_DEFAULT = 3;
export const EXPLICITO_SCAN_BATCH_MAX = 5;

export type ExplicitoScanScope =
  | { kind: "all" }
  | { kind: "tag"; tagId: string }
  | { kind: "custom"; bibliotecaPastaId: string }
  | { kind: "prog"; pastaProgramacaoId: string }
  | { kind: "programacao"; programacaoId: string };

export type ExplicitoScanRow = {
  musicaId: string;
  titulo: string;
  artista: string;
  status: "explicit" | "safe" | "lyrics_not_found" | "skipped";
  updated: boolean;
  geniusUrl?: string;
  reason?: string;
};

function scopeToWhere(scope: ExplicitoScanScope): Prisma.MusicaBibliotecaWhereInput {
  switch (scope.kind) {
    case "tag":
      return { tagsManuais: { some: { tagId: scope.tagId } } };
    case "custom":
      return { bibliotecaPastas: { some: { pastaId: scope.bibliotecaPastaId } } };
    case "prog":
      return { pastas: { some: { pastaId: scope.pastaProgramacaoId } } };
    case "programacao":
      return { pastas: { some: { pasta: { programacaoId: scope.programacaoId } } } };
    default:
      return {};
  }
}

type MusicaRow = {
  id: string;
  titulo: string;
  artista: string;
  tagsAuto: Prisma.JsonValue;
};

function applyScopeWhere(
  scope: ExplicitoScanScope,
  excludeMusicaIds?: string[],
): Prisma.MusicaBibliotecaWhereInput {
  const where: Prisma.MusicaBibliotecaWhereInput = {
    status: "pronta",
    ...scopeToWhere(scope),
  };
  const exclude = excludeMusicaIds?.filter(Boolean) ?? [];
  if (exclude.length > 0) {
    where.id = { notIn: exclude };
  }
  return where;
}

async function countPendingInScope(
  scope: ExplicitoScanScope,
  excludeMusicaIds?: string[],
): Promise<number> {
  const rows = await prisma.musicaBiblioteca.findMany({
    where: applyScopeWhere(scope, excludeMusicaIds),
    select: { tagsAuto: true },
  });
  return rows.filter((r) => needsGeniusLetraCheck(parseTagsFromJson(r.tagsAuto))).length;
}

async function loadCandidateRows(opts: {
  scope: ExplicitoScanScope;
  limit: number;
  onlyMissing: boolean;
  musicaIds?: string[];
  excludeMusicaIds?: string[];
}): Promise<MusicaRow[]> {
  const { scope, limit, onlyMissing, musicaIds, excludeMusicaIds } = opts;
  const exclude = excludeMusicaIds?.filter(Boolean) ?? [];

  if (musicaIds?.length) {
    const ids = musicaIds.filter((id) => !exclude.includes(id)).slice(0, limit * 4);
    const rows = await prisma.musicaBiblioteca.findMany({
      where: { id: { in: ids }, status: "pronta" },
      select: { id: true, titulo: true, artista: true, tagsAuto: true },
      take: limit * 4,
    });
    return onlyMissing
      ? rows.filter((r) => needsGeniusLetraCheck(parseTagsFromJson(r.tagsAuto))).slice(0, limit)
      : rows.slice(0, limit);
  }

  const where = applyScopeWhere(scope, excludeMusicaIds);

  const poolSize = onlyMissing ? limit * 12 : limit;
  const pool = await prisma.musicaBiblioteca.findMany({
    where,
    orderBy: { updatedAt: "asc" },
    take: poolSize,
    select: { id: true, titulo: true, artista: true, tagsAuto: true },
  });

  if (!onlyMissing) return pool.slice(0, limit);

  return pool
    .filter((r) => needsGeniusLetraCheck(parseTagsFromJson(r.tagsAuto)))
    .slice(0, limit);
}

export async function countExplicitoScope(scope: ExplicitoScanScope): Promise<{
  total: number;
  verified: number;
  pending: number;
}> {
  const where = { status: "pronta" as const, ...scopeToWhere(scope) };
  const total = await prisma.musicaBiblioteca.count({ where });
  if (total === 0) return { total: 0, verified: 0, pending: 0 };

  const rows = await prisma.musicaBiblioteca.findMany({
    where,
    select: { tagsAuto: true },
  });
  let verified = 0;
  for (const r of rows) {
    if (!needsGeniusLetraCheck(parseTagsFromJson(r.tagsAuto))) verified += 1;
  }
  return { total, verified, pending: total - verified };
}

export async function scanExplicitoBatch(opts: {
  scope: ExplicitoScanScope;
  limit?: number;
  onlyMissing?: boolean;
  musicaIds?: string[];
  excludeMusicaIds?: string[];
}): Promise<{
  geniusEnabled: boolean;
  scopeTotal: number;
  scopePending: number;
  processed: number;
  explicit: number;
  safe: number;
  lyricsNotFound: number;
  updated: number;
  hasMore: boolean;
  results: ExplicitoScanRow[];
  lyricsNotFoundList: Array<{
    musicaId: string;
    titulo: string;
    artista: string;
    reason?: string;
    geniusUrl?: string;
  }>;
}> {
  const enabled = geniusEnabled();
  const limit = Math.min(
    EXPLICITO_SCAN_BATCH_MAX,
    Math.max(1, opts.limit ?? EXPLICITO_SCAN_BATCH_DEFAULT),
  );
  const onlyMissing = opts.onlyMissing !== false;

  const scopeStats = await countExplicitoScope(opts.scope);

  if (!enabled) {
    return {
      geniusEnabled: false,
      scopeTotal: scopeStats.total,
      scopePending: scopeStats.pending,
      processed: 0,
      explicit: 0,
      safe: 0,
      lyricsNotFound: 0,
      updated: 0,
      hasMore: false,
      results: [],
      lyricsNotFoundList: [],
    };
  }

  const rows = await loadCandidateRows({
    scope: opts.scope,
    limit,
    onlyMissing,
    musicaIds: opts.musicaIds,
    excludeMusicaIds: opts.excludeMusicaIds,
  });

  const results: ExplicitoScanRow[] = [];
  const lyricsNotFoundList: Array<{
    musicaId: string;
    titulo: string;
    artista: string;
    reason?: string;
    geniusUrl?: string;
  }> = [];
  let explicit = 0;
  let safe = 0;
  let lyricsNotFound = 0;
  let updated = 0;

  for (const m of rows) {
    const existing = parseTagsFromJson(m.tagsAuto);

    if (onlyMissing && !needsGeniusLetraCheck(existing)) {
      results.push({
        musicaId: m.id,
        titulo: m.titulo,
        artista: m.artista,
        status: "skipped",
        updated: false,
      });
      continue;
    }

    const lyricsResult = await fetchGeniusLyrics(m.artista, m.titulo);

    if (!lyricsResult.ok) {
      lyricsNotFound += 1;
      const reason =
        lyricsResult.reason === "not_found" ? "letra_nao_encontrada"
        : lyricsResult.reason === "no_lyrics" ? "pagina_sem_letra"
        : lyricsResult.reason === "no_token" ? "genius_desabilitado"
        : "erro_busca";
      lyricsNotFoundList.push({
        musicaId: m.id,
        titulo: m.titulo,
        artista: m.artista,
        reason,
        geniusUrl: lyricsResult.geniusUrl,
      });
      results.push({
        musicaId: m.id,
        titulo: m.titulo,
        artista: m.artista,
        status: "lyrics_not_found",
        updated: false,
        reason,
        geniusUrl: lyricsResult.geniusUrl,
      });
      // Rotaciona fila (sem selo) para não repetir as mesmas faixas no lote seguinte.
      await prisma.musicaBiblioteca.update({
        where: { id: m.id },
        data: { updatedAt: new Date() },
      });
      continue;
    }

    const isExplicit = lyricsContainProfanity(lyricsResult.lyrics);
    const merged = mergeGeniusLetraCheck(existing, isExplicit);

    if (geniusLetraTagsChanged(existing, merged)) {
      await prisma.musicaBiblioteca.update({
        where: { id: m.id },
        data: { tagsAuto: merged as Prisma.InputJsonValue },
      });
      updated += 1;
    }

    if (isExplicit) explicit += 1;
    else safe += 1;

    results.push({
      musicaId: m.id,
      titulo: m.titulo,
      artista: m.artista,
      status: isExplicit ? "explicit" : "safe",
      updated: true,
      geniusUrl: lyricsResult.geniusUrl,
    });

    await new Promise((r) => setTimeout(r, 400));
  }

  const processedIds = results
    .filter((r) => r.status !== "skipped")
    .map((r) => r.musicaId);
  const sessionExclude = [...(opts.excludeMusicaIds ?? []), ...processedIds];
  const remainingPending = onlyMissing
    ? await countPendingInScope(opts.scope, sessionExclude)
    : 0;
  const hasMore = onlyMissing && remainingPending > 0 && processedIds.length > 0;

  return {
    geniusEnabled: true,
    scopeTotal: scopeStats.total,
    scopePending: scopeStats.pending,
    processed: processedIds.length,
    explicit,
    safe,
    lyricsNotFound,
    updated,
    hasMore,
    results,
    lyricsNotFoundList,
  };
}
