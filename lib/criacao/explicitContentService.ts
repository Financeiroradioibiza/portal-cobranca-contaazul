import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  canConfirmExplicitFromApis,
  explicitTagsChanged,
  extractExplicitApiStatus,
  finalizeGeminiExplicitVerdict,
  hasApiExplicitCheck,
  mergeApiExplicitCheck,
  mergeGeminiExplicitCheck,
  needsGeminiExplicitCheck,
} from "@/lib/criacao/explicitContentCore";
import {
  classifyExplicitLyricsWithGemini,
  type GeminiExplicitResult,
} from "@/lib/criacao/explicitGeminiService";
import { geminiEnabled } from "@/lib/criacao/geminiClient";
import type { ExternalAutoTag } from "@/lib/criacao/tagEnrichmentCore";
import { fetchDeezerExplicit, fetchMusicBrainzExplicit } from "@/lib/criacao/tagEnrichmentCore";
import { parseTagsFromJson } from "@/lib/criacao/tagEnrichmentService";

export type ExplicitCheckResult = {
  musicaId: string;
  explicit: boolean;
  updated: boolean;
  geminiStatus?: "sim" | "nao" | "desconhecida";
  geminiFailed?: boolean;
  geminiError?: string;
};

function tagsToJson(tags: ExternalAutoTag[]): Prisma.InputJsonValue {
  return tags as Prisma.InputJsonValue;
}

type MusicaRow = {
  id: string;
  titulo: string;
  artista: string;
  isrc: string | null;
  tagsAuto: Prisma.JsonValue;
};

/** Camadas 1+2: consulta Deezer + MusicBrainz e grava tags visíveis. */
export async function checkMusicasExplicitApisBatch(opts: {
  limit?: number;
  musicaIds?: string[];
  onlyMissing?: boolean;
}): Promise<{ processed: number; explicit: number; updated: number; results: ExplicitCheckResult[] }> {
  const limit = Math.min(10, Math.max(1, opts.limit ?? 10));
  const ids = opts.musicaIds?.filter(Boolean) ?? [];
  const onlyMissing = opts.onlyMissing !== false;

  let rows: MusicaRow[];

  if (ids.length > 0) {
    rows = await prisma.musicaBiblioteca.findMany({
      where: { id: { in: ids.slice(0, limit) } },
      select: { id: true, titulo: true, artista: true, isrc: true, tagsAuto: true },
    });
  } else {
    const pool = await prisma.musicaBiblioteca.findMany({
      where: { status: "pronta" },
      orderBy: { updatedAt: "asc" },
      take: limit * 8,
      select: { id: true, titulo: true, artista: true, isrc: true, tagsAuto: true },
    });
    rows =
      onlyMissing ?
        pool.filter((m) => !hasApiExplicitCheck(parseTagsFromJson(m.tagsAuto))).slice(0, limit)
      : pool.slice(0, limit);
  }

  const deezerResults = await Promise.all(
    rows.map((r) => fetchDeezerExplicit({ titulo: r.titulo, artista: r.artista })),
  );

  const results: ExplicitCheckResult[] = [];
  let explicit = 0;
  let updated = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const m = rows[i]!;
    const existing = parseTagsFromJson(m.tagsAuto);
    const deezer = deezerResults[i] ?? null;
    const musicbrainz = await fetchMusicBrainzExplicit({
      titulo: m.titulo,
      artista: m.artista,
      isrc: m.isrc,
    });
    const merged = mergeApiExplicitCheck(existing, { deezer, musicbrainz });
    const dzExp = deezer === true;
    const mbExp = musicbrainz === true;

    if (!explicitTagsChanged(existing, merged)) {
      results.push({ musicaId: m.id, explicit: dzExp || mbExp, updated: false });
      if (dzExp || mbExp) explicit += 1;
      continue;
    }

    await prisma.musicaBiblioteca.update({
      where: { id: m.id },
      data: { tagsAuto: tagsToJson(merged) },
    });
    results.push({ musicaId: m.id, explicit: dzExp || mbExp, updated: true });
    updated += 1;
    if (dzExp || mbExp) explicit += 1;
  }

  return { processed: results.length, explicit, updated, results };
}

/** Camada 3: Gemini (letras) → tag EXP vermelho se explícito. */
export async function checkMusicasExplicitGeminiBatch(opts: {
  limit?: number;
  musicaIds?: string[];
  onlyMissing?: boolean;
}): Promise<{
  processed: number;
  explicit: number;
  updated: number;
  skippedGemini: number;
  geminiFailed: number;
  geminiLastError?: string;
  hasMorePending: boolean;
  geminiEnabled: boolean;
  results: ExplicitCheckResult[];
}> {
  if (!geminiEnabled()) {
    return {
      processed: 0,
      explicit: 0,
      updated: 0,
      skippedGemini: 0,
      geminiEnabled: false,
      geminiFailed: 0,
      hasMorePending: false,
      results: [],
    };
  }

  const limit = Math.min(30, Math.max(1, opts.limit ?? 1));
  const ids = opts.musicaIds?.filter(Boolean) ?? [];
  const onlyMissing = opts.onlyMissing !== false;

  let rows: MusicaRow[];

  if (ids.length > 0) {
    rows = await prisma.musicaBiblioteca.findMany({
      where: { id: { in: ids.slice(0, limit) } },
      select: { id: true, titulo: true, artista: true, isrc: true, tagsAuto: true },
    });
  } else {
    const pool = await prisma.musicaBiblioteca.findMany({
      where: { status: "pronta" },
      orderBy: { updatedAt: "asc" },
      take: limit * 32,
      select: { id: true, titulo: true, artista: true, isrc: true, tagsAuto: true },
    });
    rows =
      onlyMissing ?
        pool.filter((m) => needsGeminiExplicitCheck(parseTagsFromJson(m.tagsAuto))).slice(0, limit)
      : pool.slice(0, limit);
  }

  const geminiRows = rows.filter((r) => {
    const tags = parseTagsFromJson(r.tagsAuto);
    const dz = extractExplicitApiStatus(tags, "deezer");
    const mb = extractExplicitApiStatus(tags, "musicbrainz");
    return !canConfirmExplicitFromApis(dz, mb);
  });

  const geminiMap =
    geminiRows.length > 0 ?
      await classifyExplicitLyricsWithGemini(
        geminiRows.map((r) => {
          const tags = parseTagsFromJson(r.tagsAuto);
          return {
            id: r.id,
            titulo: r.titulo,
            artista: r.artista,
            deezerExplicit: extractExplicitApiStatus(tags, "deezer"),
            musicbrainzExplicit: extractExplicitApiStatus(tags, "musicbrainz"),
          };
        }),
      )
    : new Map<string, import("@/lib/criacao/explicitGeminiService").GeminiClassifyOutcome>();

  const results: ExplicitCheckResult[] = [];
  let explicit = 0;
  let updated = 0;
  let skippedGemini = 0;
  let geminiFailed = 0;
  let geminiLastError: string | undefined;

  for (const m of rows) {
    const existing = parseTagsFromJson(m.tagsAuto);
    const dz = extractExplicitApiStatus(existing, "deezer");
    const mb = extractExplicitApiStatus(existing, "musicbrainz");
    const apiConfirmed = canConfirmExplicitFromApis(dz, mb);
    const outcome = apiConfirmed ? undefined : geminiMap.get(m.id);
    if (apiConfirmed) skippedGemini += 1;

    if (!apiConfirmed && outcome?.apiFailed) {
      geminiFailed += 1;
      if (!geminiLastError && outcome.apiError) geminiLastError = outcome.apiError;
      results.push({
        musicaId: m.id,
        explicit: false,
        updated: false,
        geminiFailed: true,
        geminiError: outcome.apiError,
      });
      continue;
    }

    const geminiRaw: GeminiExplicitResult =
      apiConfirmed ? "desconhecida" : (outcome?.result ?? "desconhecida");
    const geminiTag = finalizeGeminiExplicitVerdict(geminiRaw, dz, mb);
    const merged = mergeGeminiExplicitCheck(existing, geminiTag);
    const isExp = geminiTag === "sim";

    if (!explicitTagsChanged(existing, merged)) {
      results.push({ musicaId: m.id, explicit: isExp, updated: false, geminiStatus: geminiTag });
      if (isExp) explicit += 1;
      continue;
    }

    await prisma.musicaBiblioteca.update({
      where: { id: m.id },
      data: { tagsAuto: tagsToJson(merged) },
    });
    results.push({ musicaId: m.id, explicit: isExp, updated: true, geminiStatus: geminiTag });
    updated += 1;
    if (isExp) explicit += 1;
  }

  let hasMorePending = false;
  if (onlyMissing && ids.length === 0) {
    const peek = await prisma.musicaBiblioteca.findMany({
      where: { status: "pronta" },
      orderBy: { updatedAt: "asc" },
      take: 80,
      select: { tagsAuto: true },
    });
    hasMorePending = peek.some((m) => needsGeminiExplicitCheck(parseTagsFromJson(m.tagsAuto)));
  }

  return {
    processed: results.length,
    explicit,
    updated,
    skippedGemini,
    geminiFailed,
    geminiLastError,
    hasMorePending,
    geminiEnabled: true,
    results,
  };
}
