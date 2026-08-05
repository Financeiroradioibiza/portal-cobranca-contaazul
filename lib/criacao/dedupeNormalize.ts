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

/** Artista — trata e / & / and como equivalentes; remove feat. */
export function normalizeArtistaForDedupe(s: string): string {
  let a = normalizeMetaForDedupe(s);
  a = a.replace(/\b(feat|ft|featuring|with|vs|x)\b.+$/i, "").trim();
  a = a.replace(/\b(and|e|y|et)\b/g, " ");
  return a.replace(/\s+/g, " ").trim();
}

function artistaTokensForDedupe(s: string): string[] {
  return normalizeArtistaForDedupe(s)
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) row[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length]!;
}

function stringSimilarityRatio(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

export function tituloMatchesForDedupe(a: string, b: string): boolean {
  return normalizeTitleForDedupe(a) === normalizeTitleForDedupe(b);
}

/** Mesmo artista com e/&/and ou ordem de tokens equivalente (+ typo leve, ex. Mendez/Mendes). */
export function artistaMatchesForDedupe(a: string, b: string): boolean {
  const na = normalizeArtistaForDedupe(a);
  const nb = normalizeArtistaForDedupe(b);
  if (na.length < 2 || nb.length < 2) return false;
  if (na === nb) return true;
  if (stringSimilarityRatio(na, nb) >= 0.88) return true;
  const ta = new Set(artistaTokensForDedupe(a));
  const tb = new Set(artistaTokensForDedupe(b));
  if (ta.size < 2 || tb.size < 2) return false;
  if (ta.size !== tb.size) return false;
  return [...ta].every((t) => tb.has(t));
}

export function metadataMatchesForDedupe(
  uploadArtista: string,
  uploadTitulo: string,
  existArtista: string,
  existTitulo: string,
): boolean {
  if (!tituloMatchesForDedupe(uploadTitulo, existTitulo)) return false;
  return artistaMatchesForDedupe(uploadArtista, existArtista);
}

export function metadataDedupeKey(artista: string, titulo: string): string {
  return `${normalizeArtistaForDedupe(artista)}|${normalizeTitleForDedupe(titulo)}`;
}
