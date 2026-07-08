/**
 * Resolve «Artista - Música» para link Deezer com match de artista + título.
 * Usado no Download link (Deemix) — nunca aceita só o título quando o artista foi informado.
 */

const DZ_BASE = 'https://api.deezer.com';
const UA = 'RadioIbizaPortal/1.0 (download-link; contact@radioibiza.com.br)';

export type ParsedArtistTitle = { artista: string; titulo: string };

type DeezerTrackHit = {
  id?: number;
  link?: string;
  title?: string;
  artist?: { name?: string };
};

export function normalizeDownloadSearchLine(line: string): string {
  let s = line.trim();
  s = s.replace(/\.(mp3|flac|m4a|wav)$/i, '');
  s = s.replace(/~\d+$/i, '');
  s = s.replace(/\s*\(\d+\)\s*$/i, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function parseArtistTitleFromLine(line: string): ParsedArtistTitle | null {
  const base = normalizeDownloadSearchLine(line);
  const m = base.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (!m) return null;
  const artista = m[1]!.trim();
  const titulo = m[2]!.trim();
  if (!artista || !titulo || artista.length < 2 || titulo.length < 2) return null;
  return { artista, titulo };
}

function normalizeSearchTitle(titulo: string): string {
  return titulo
    .replace(/\s*\((?:part\.|part|feat\.|feat|ft\.|ft|featuring)[^)]*\)/gi, '')
    .replace(/\s*\([^)]*(?:official|video|audio|lyric|visualizer|mv|hd|4k|live)[^)]*\)/gi, '')
    .replace(/\s*\([^)]*(?:mix|remaster|remix|edit|version|ver\.|radio|acoustic)[^)]*\)/gi, '')
    .replace(/\s*[-–—]\s*(?:acoustic|live|radio edit|remix|cover)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSearchArtist(artista: string): string {
  const trimmed = artista.trim();
  const alt = trimmed.replace(/^the\s+/i, '').trim();
  return alt || trimmed;
}

function scoreDeezerHit(input: ParsedArtistTitle, hit: DeezerTrackHit): number {
  const hitTitle = hit.title?.trim() ?? '';
  const hitArtist = hit.artist?.name?.trim() ?? '';
  if (!hitTitle || !hitArtist) return 0;

  const wantTitle = normalizeSearchTitle(input.titulo).toLowerCase();
  const gotTitle = normalizeSearchTitle(hitTitle).toLowerCase();
  const wantArtist = normalizeSearchArtist(input.artista).toLowerCase();
  const gotArtist = normalizeSearchArtist(hitArtist).toLowerCase();

  const titleOk =
    wantTitle === gotTitle ||
    (wantTitle.length >= 5 && gotTitle.includes(wantTitle)) ||
    (gotTitle.length >= 5 && wantTitle.includes(gotTitle));

  const artistOk =
    wantArtist === gotArtist ||
    (wantArtist.length >= 4 && gotArtist.includes(wantArtist)) ||
    (gotArtist.length >= 4 && wantArtist.includes(gotArtist));

  if (!titleOk || !artistOk) return 0;
  return wantTitle === gotTitle && wantArtist === gotArtist ? 100 : 85;
}

async function dzFetch(path: string): Promise<{ data?: DeezerTrackHit[] } | null> {
  try {
    const res = await fetch(`${DZ_BASE}${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as { data?: DeezerTrackHit[] };
  } catch {
    return null;
  }
}

async function searchDeezerTracks(input: ParsedArtistTitle): Promise<DeezerTrackHit[]> {
  const titulo = normalizeSearchTitle(input.titulo);
  const tituloRaw = input.titulo.trim();
  const artista = input.artista.trim();
  const artistaAlt = normalizeSearchArtist(artista);

  const queries = [
    `artist:"${artista}" track:"${titulo}"`,
    tituloRaw !== titulo ? `artist:"${artista}" track:"${tituloRaw}"` : null,
    `${artista} ${titulo}`,
    artistaAlt !== artista ? `${artistaAlt} ${titulo}` : null,
  ].filter((q): q is string => Boolean(q));

  const seen = new Set<number>();
  const hits: DeezerTrackHit[] = [];

  for (const q of queries) {
    const structured = q.includes('"') || q.includes('track:') || q.includes('artist:');
    const path = structured
      ? `/search?q=${encodeURIComponent(q)}&limit=8`
      : `/search/track?q=${encodeURIComponent(q)}&limit=8`;
    const search = await dzFetch(path);
    for (const t of search?.data ?? []) {
      if (t.id && !seen.has(t.id)) {
        seen.add(t.id);
        hits.push(t);
      }
    }
    if (hits.length >= 3) break;
  }

  return hits;
}

function pickBestHit(input: ParsedArtistTitle, hits: DeezerTrackHit[]): DeezerTrackHit | undefined {
  let best: DeezerTrackHit | undefined;
  let bestScore = 0;
  for (const hit of hits) {
    const score = scoreDeezerHit(input, hit);
    if (score > bestScore) {
      bestScore = score;
      best = hit;
    }
  }
  return bestScore >= 85 ? best : undefined;
}

export async function resolveDeezerTrackUrlFromText(line: string): Promise<string> {
  const parsed = parseArtistTitleFromLine(line);
  if (!parsed) {
    throw new Error(
      'Use o formato «Artista - Música» (primeiro hífen separa artista) ou cole link deezer.com/track/…',
    );
  }

  const hits = await searchDeezerTracks(parsed);
  const best = pickBestHit(parsed, hits);

  if (!best?.id) {
    throw new Error(
      `Nenhuma faixa no Deezer com artista «${parsed.artista}» e título «${parsed.titulo}» — confira ortografia ou cole o link da faixa.`,
    );
  }

  return best.link ?? `https://www.deezer.com/track/${best.id}`;
}
