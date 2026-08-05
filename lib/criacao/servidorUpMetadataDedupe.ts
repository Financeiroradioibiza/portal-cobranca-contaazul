import {
  metadataDedupeKey,
  metadataMatchesForDedupe,
  normalizeArtistaForDedupe,
  normalizeTitleForDedupe,
} from "@/lib/criacao/dedupeNormalize";

export type BibliotecaMetadataRow = {
  id: string;
  artista: string;
  titulo: string;
  durationMs: number | null;
};

export type BibliotecaMetadataIndex = {
  byExactKey: Map<string, BibliotecaMetadataRow>;
  byTitle: Map<string, BibliotecaMetadataRow[]>;
};

function durationClose(aSec: number | null | undefined, bMs: number | null, toleranceSec = 4): boolean {
  if (aSec == null || bMs == null) return true;
  return Math.abs(aSec - bMs / 1000) <= toleranceSec;
}

export function buildBibliotecaMetadataIndex(rows: BibliotecaMetadataRow[]): BibliotecaMetadataIndex {
  const byExactKey = new Map<string, BibliotecaMetadataRow>();
  const byTitle = new Map<string, BibliotecaMetadataRow[]>();

  for (const row of rows) {
    const key = metadataDedupeKey(row.artista, row.titulo);
    if (key.length > 3 && !byExactKey.has(key)) byExactKey.set(key, row);

    const titleKey = normalizeTitleForDedupe(row.titulo);
    if (titleKey.length < 2) continue;
    const list = byTitle.get(titleKey) ?? [];
    list.push(row);
    byTitle.set(titleKey, list);
  }

  return { byExactKey, byTitle };
}

/**
 * Mesma regra do cloud2 (metadataMatchesForDedupe) — não só chave exata.
 * Título único sem artista no arquivo também pode bater (ex. «Prata.mp3»).
 */
export function findBibliotecaMetadataHit(
  artista: string,
  titulo: string,
  durationSec: number | null | undefined,
  index: BibliotecaMetadataIndex,
): BibliotecaMetadataRow | null {
  const titleKey = normalizeTitleForDedupe(titulo);
  if (titleKey.length < 2) return null;

  const exactKey = metadataDedupeKey(artista, titulo);
  if (exactKey.length > 3) {
    const exact = index.byExactKey.get(exactKey);
    if (exact && durationClose(durationSec, exact.durationMs)) return exact;
  }

  const candidates = index.byTitle.get(titleKey) ?? [];
  if (candidates.length === 0) return null;

  const artistNorm = normalizeArtistaForDedupe(artista);
  if (artistNorm.length >= 2) {
    for (const row of candidates) {
      if (!metadataMatchesForDedupe(artista, titulo, row.artista, row.titulo)) continue;
      if (durationClose(durationSec, row.durationMs)) return row;
    }
    return null;
  }

  const durOk = candidates.filter((row) => durationClose(durationSec, row.durationMs));
  if (durOk.length === 1) return durOk[0]!;
  return null;
}

/** Título bate mas há vários artistas — só sugestão, não auto-assign. */
export function findBibliotecaMetadataSuggest(
  artista: string,
  titulo: string,
  durationSec: number | null | undefined,
  index: BibliotecaMetadataIndex,
): BibliotecaMetadataRow | null {
  const hit = findBibliotecaMetadataHit(artista, titulo, durationSec, index);
  if (hit) return hit;

  const titleKey = normalizeTitleForDedupe(titulo);
  if (titleKey.length < 2) return null;
  const candidates = (index.byTitle.get(titleKey) ?? []).filter((row) =>
    durationClose(durationSec, row.durationMs),
  );
  if (candidates.length !== 1) return null;
  if (normalizeArtistaForDedupe(artista).length >= 2) return null;
  return candidates[0]!;
}
