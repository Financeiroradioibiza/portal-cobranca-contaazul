const DZ_BASE = "https://api.deezer.com";

const COVER_CACHE = new Map<string, string | null>();
const PLACEHOLDER_COLORS = ["#E93A7D", "#FF7A3D", "#9B6BFF"] as const;

type DeezerSearchHit = {
  id?: number;
  album?: { cover_medium?: string; cover_big?: string; cover_xl?: string };
};

function coverFromHit(hit: DeezerSearchHit): string | null {
  const album = hit.album;
  if (!album) return null;
  return album.cover_xl ?? album.cover_big ?? album.cover_medium ?? null;
}

async function dzSearch(q: string): Promise<DeezerSearchHit[]> {
  try {
    const res = await fetch(`${DZ_BASE}/search?q=${encodeURIComponent(q)}&limit=5`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: DeezerSearchHit[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

/** Busca capa de álbum no Deezer (best-effort, com cache em memória). */
export async function fetchDeezerAlbumCover(artista: string, titulo: string): Promise<string | null> {
  const a = artista.trim();
  const t = titulo.trim();
  if (!a || !t) return null;

  const cacheKey = `${a}\0${t}`.toLowerCase();
  if (COVER_CACHE.has(cacheKey)) return COVER_CACHE.get(cacheKey) ?? null;

  const queries = [
    `artist:"${a}" track:"${t}"`,
    `${a} ${t}`,
    t,
  ];

  for (const q of queries) {
    const hits = await dzSearch(q);
    for (const hit of hits) {
      const cover = coverFromHit(hit);
      if (cover) {
        COVER_CACHE.set(cacheKey, cover);
        return cover;
      }
    }
  }

  COVER_CACHE.set(cacheKey, null);
  return null;
}

export function placeholderCoverUrl(index: number, label: string): string {
  const color = PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length]!;
  const text = encodeURIComponent(label.slice(0, 12) || `CAPA ${index + 1}`);
  return `https://placehold.co/200x200/${color.slice(1)}/0D0B14?text=${text}`;
}

export async function resolveTrackCovers(
  tracks: Array<{ artista: string; titulo: string }>,
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const tr = tracks[i]!;
    const cover = await fetchDeezerAlbumCover(tr.artista, tr.titulo);
    out.push(cover ?? placeholderCoverUrl(i, tr.titulo));
  }
  return out;
}
