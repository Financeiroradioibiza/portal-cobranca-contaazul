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

async function loadCandidateRows(opts: {
  scope: ExplicitoScanScope;
  limit: number;
  onlyMissing: boolean;
  musicaIds?: string[];
}): Promise<MusicaRow[]> {
  const { scope, limit, onlyMissing, musicaIds } = opts;

  if (musicaIds?.length) {
    const rows = await prisma.musicaBiblioteca.findMany({
      where: { id: { in: musicaIds.slice(0, limit * 4) }, status: "pronta" },
      select: { id: true, titulo: true, artista: true, tagsAuto: true },
      take: limit * 4,
    });
    return onlyMissing
      ? rows.filter((r) => needsGeniusLetraCheck(parseTagsFromJson(r.tagsAuto))).slice(0, limit)
      : rows.slice(0, limit);
  }

  const where: Prisma.MusicaBibliotecaWhereInput = {
    status: "pronta",
    ...scopeToWhere(scope),
  };

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
}): Promise<{
  geniusEnabled: boolean;
  processed: number;
  explicit: number;
  safe: number;
  lyricsNotFound: number;
  updated: number;
  hasMore: boolean;
  results: ExplicitoScanRow[];
  lyricsNotFoundList: Array<{ musicaId: string; titulo: string; artista: string; reason?: string }>;
}> {
  const enabled = geniusEnabled();
  const limit = Math.min(
    EXPLICITO_SCAN_BATCH_MAX,
    Math.max(1, opts.limit ?? EXPLICITO_SCAN_BATCH_DEFAULT),
  );
  const onlyMissing = opts.onlyMissing !== false;

  if (!enabled) {
    return {
      geniusEnabled: false,
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
  });

  const results: ExplicitoScanRow[] = [];
  const lyricsNotFoundList: Array<{
    musicaId: string;
    titulo: string;
    artista: string;
    reason?: string;
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
      });
      results.push({
        musicaId: m.id,
        titulo: m.titulo,
        artista: m.artista,
        status: "lyrics_not_found",
        updated: false,
        reason,
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

  const stats = await countExplicitoScope(opts.scope);
  const hasMore = onlyMissing && stats.pending > 0 && rows.length > 0;

  return {
    geniusEnabled: true,
    processed: results.filter((r) => r.status !== "skipped").length,
    explicit,
    safe,
    lyricsNotFound,
    updated,
    hasMore,
    results,
    lyricsNotFoundList,
  };
}
