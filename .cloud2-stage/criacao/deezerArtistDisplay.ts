/** Metadados de artista a partir da API pública Deezer (track). */

export type DeezerTrackApiPayload = {
  title?: string;
  artist?: { name?: string };
  contributors?: Array<{ name?: string; role?: string }>;
};

function uniqueContributorNames(
  contributors: Array<{ name?: string; role?: string }>,
  rolePattern: RegExp,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of contributors) {
    if (!rolePattern.test(String(c.role ?? '').trim())) continue;
    const name = String(c.name ?? '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * Nome de exibição do artista — inclui colaboradores Main quando o Deezer
 * só expõe o principal em `artist.name` (ex.: Paul McCartney & Michael Jackson).
 */
export function artistDisplayFromDeezerTrack(data: DeezerTrackApiPayload): string {
  const primary = String(data.artist?.name ?? '').trim();
  const contributors = data.contributors ?? [];
  const mains = uniqueContributorNames(contributors, /^main$/i);

  if (mains.length >= 2) return mains.join(' & ');
  if (mains.length === 1) return mains[0]!;
  return primary;
}

function trackIdFromInput(trackUrlOrId: string): string | null {
  const raw = trackUrlOrId.trim();
  if (!raw) return null;
  const fromUrl = raw.match(/\/track\/(\d+)/i)?.[1];
  if (fromUrl) return fromUrl;
  if (/^\d+$/.test(raw)) return raw;
  return null;
}

/** Busca título + artista (com colaboradores Main) via api.deezer.com/track/{id}. */
export async function fetchDeezerTrackDisplayMeta(
  trackUrlOrId: string,
): Promise<{ titulo: string; artista: string } | null> {
  const trackId = trackIdFromInput(trackUrlOrId);
  if (!trackId) return null;
  try {
    const res = await fetch(`https://api.deezer.com/track/${trackId}`, {
      headers: { 'User-Agent': 'RadioIbizaCloud2/1.0' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as DeezerTrackApiPayload;
    const titulo = String(data.title ?? '').trim();
    const artista = artistDisplayFromDeezerTrack(data);
    if (!titulo) return null;
    return { titulo, artista };
  } catch {
    return null;
  }
}
