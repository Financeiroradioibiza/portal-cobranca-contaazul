/** Ordem crescente de qualidade — preview sempre usa a mais baixa disponível. */
export const PREVIEW_FORMATO_RANK: Record<string, number> = {
  mp3_128_mono: 0,
  mp3_128_stereo: 1,
  mp3_192_mono: 2,
  mp3_192_stereo: 3,
};

export function pickLowestPreviewFormato(
  versoes: ReadonlyArray<{ formato: string }>,
): string | null {
  if (!versoes.length) return null;
  const known = versoes
    .map((v) => v.formato)
    .filter((f) => f in PREVIEW_FORMATO_RANK);
  if (known.length === 0) return versoes[0]?.formato ?? null;
  known.sort((a, b) => PREVIEW_FORMATO_RANK[a]! - PREVIEW_FORMATO_RANK[b]!);
  return known[0] ?? null;
}
