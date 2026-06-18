import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  extractGravadoraFromTags,
  fetchLabelTags,
  mergeExternalTags,
  parseTagsFromJson,
  type ExternalAutoTag,
} from "@/lib/criacao/tagEnrichmentCore";

export type EnrichResult = {
  musicaId: string;
  updated: boolean;
  gravadora: string;
  fontes: string[];
};

function tagsToJson(tags: ExternalAutoTag[]): Prisma.InputJsonValue {
  return tags as Prisma.InputJsonValue;
}

export { parseTagsFromJson, extractGravadoraFromTags };

export async function enrichMusicaLabels(musicaId: string): Promise<EnrichResult> {
  const m = await prisma.musicaBiblioteca.findUnique({
    where: { id: musicaId },
    select: { id: true, titulo: true, artista: true, isrc: true, tagsAuto: true },
  });
  if (!m) throw new Error("not_found");

  const existing = parseTagsFromJson(m.tagsAuto);
  const before = extractGravadoraFromTags(existing);
  const additions = await fetchLabelTags({
    titulo: m.titulo,
    artista: m.artista,
    isrc: m.isrc,
  });

  if (additions.length === 0) {
    return { musicaId: m.id, updated: false, gravadora: before, fontes: [] };
  }

  const merged = mergeExternalTags(existing, additions);
  const after = extractGravadoraFromTags(merged);
  if (after === before && before !== "") {
    return {
      musicaId: m.id,
      updated: false,
      gravadora: after,
      fontes: additions.map((t) => t.fonte),
    };
  }

  await prisma.musicaBiblioteca.update({
    where: { id: m.id },
    data: { tagsAuto: tagsToJson(merged) },
  });

  return {
    musicaId: m.id,
    updated: true,
    gravadora: after,
    fontes: additions.map((t) => t.fonte),
  };
}

export async function enrichMusicasLabelsBatch(opts: {
  limit?: number;
  musicaIds?: string[];
  onlyMissing?: boolean;
}): Promise<{ processed: number; updated: number; results: EnrichResult[] }> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const ids = opts.musicaIds?.filter(Boolean) ?? [];

  let rows: { id: string }[];
  if (ids.length > 0) {
    rows = ids.slice(0, limit).map((id) => ({ id }));
  } else {
    rows = await prisma.musicaBiblioteca.findMany({
      where: { status: "pronta" },
      orderBy: { updatedAt: "desc" },
      take: limit * 3,
      select: { id: true, tagsAuto: true },
    }).then((all) => {
      if (!opts.onlyMissing) return all.slice(0, limit);
      return all
        .filter((m) => !extractGravadoraFromTags(parseTagsFromJson(m.tagsAuto)))
        .slice(0, limit);
    });
  }

  const results: EnrichResult[] = [];
  let updated = 0;
  for (const row of rows) {
    const r = await enrichMusicaLabels(row.id);
    results.push(r);
    if (r.updated) updated += 1;
  }

  return { processed: results.length, updated, results };
}
