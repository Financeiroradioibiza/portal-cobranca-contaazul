/** Percentuais disponíveis no OFF (Criador). */
export const OFF_PERCENT_OPTIONS = [5, 10, 15, 20, 25, 30] as const;

export type OffPercent = (typeof OFF_PERCENT_OPTIONS)[number];

export function isOffPercent(n: number): n is OffPercent {
  return (OFF_PERCENT_OPTIONS as readonly number[]).includes(n);
}

type LinkWithAddedAt = { id: string; addedAt: string | null };

/** Ordena por entrada na pasta (mais antigas primeiro; sem data = tratadas como mais antigas). */
export function sortByAddedAtOldestFirst<T extends LinkWithAddedAt>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aa = a.addedAt ?? "";
    const bb = b.addedAt ?? "";
    if (aa !== bb) return aa.localeCompare(bb);
    return a.id.localeCompare(b.id);
  });
}

/** Seleciona N% das faixas mais antigas (mínimo 1 se a pasta não estiver vazia). */
export function pickOldestMusicaIdsForOffPercent(
  items: LinkWithAddedAt[],
  percent: OffPercent,
): string[] {
  if (items.length === 0) return [];
  const sorted = sortByAddedAtOldestFirst(items);
  const count = Math.max(1, Math.ceil((sorted.length * percent) / 100));
  return sorted.slice(0, count).map((m) => m.id);
}
