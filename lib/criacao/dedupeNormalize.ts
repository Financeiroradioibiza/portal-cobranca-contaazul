/** Normalização compartilhada com cloud2 `.cloud2-stage/criacao/dedupe.ts`. */

export function normalizeMetaForDedupe(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Título para dedupe — remove feat/ft e variantes ortográficas comuns. */
export function normalizeTitleForDedupe(s: string): string {
  let t = normalizeMetaForDedupe(s);
  t = t.replace(/\b(feat|ft|featuring|with|vs|x)\b.+$/i, "").trim();
  t = t.replace(/\blivin\b/g, "living");
  t = t.replace(/\bgoin\b/g, "going");
  return t.trim();
}

export function metadataDedupeKey(artista: string, titulo: string): string {
  return `${normalizeMetaForDedupe(artista)}|${normalizeTitleForDedupe(titulo)}`;
}
