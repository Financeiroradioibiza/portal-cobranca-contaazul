import { fetchAzlyricsLyrics } from "@/lib/criacao/azlyricsLyricsService";
import { normalizeSearchTitle } from "@/lib/criacao/tagEnrichmentCore";

const GENIUS_BASE = "https://api.genius.com";
const API_UA = "RadioIbizaPortal/1.0 (criacao-explicito; contact@radioibiza.com.br)";
const PAGE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type LyricsSource = "genius_page" | "azlyrics" | "lyrics_ovh";

export type LyricsFetchResult =
  | {
      ok: true;
      lyrics: string;
      source: LyricsSource;
      lyricsUrl: string;
      geniusUrl?: string;
      geniusId?: number;
    }
  | {
      ok: false;
      reason: "not_found" | "no_lyrics" | "fetch_error";
      geniusUrl?: string;
      geniusId?: number;
    };

/** @deprecated use LyricsFetchResult */
export type GeniusLyricsResult = LyricsFetchResult;

export function geniusEnabled(): boolean {
  return Boolean(process.env.GENIUS_ACCESS_TOKEN?.trim());
}

function authHeaders(): HeadersInit {
  const token = process.env.GENIUS_ACCESS_TOKEN?.trim();
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "User-Agent": API_UA,
  };
}

type GeniusSearchHit = {
  result?: {
    id?: number;
    url?: string;
    title?: string;
    primary_artist?: { name?: string };
  };
};

function searchQueries(artista: string, titulo: string): string[] {
  const a = artista.trim();
  const raw = titulo.trim();
  const norm = normalizeSearchTitle(raw);
  const uniq = new Set<string>();
  for (const q of [`${a} ${norm}`, `${a} ${raw}`, `${norm} ${a}`, norm, raw]) {
    const t = q.trim();
    if (t.length >= 3) uniq.add(t);
  }
  return [...uniq];
}

type GeniusSongHit = {
  id: number;
  url: string;
  title?: string;
  primary_artist?: { name?: string };
};

async function searchGeniusOnce(query: string): Promise<GeniusSongHit[]> {
  const res = await fetch(`${GENIUS_BASE}/search?q=${encodeURIComponent(query)}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { response?: { hits?: GeniusSearchHit[] } };
  const out: GeniusSongHit[] = [];
  for (const h of data.response?.hits ?? []) {
    const r = h.result;
    if (r?.id && r.url) out.push({ id: r.id, url: r.url, title: r.title, primary_artist: r.primary_artist });
  }
  return out;
}

function scoreHit(r: GeniusSongHit, artista: string, titulo: string): number {
  const artistNorm = artista.trim().toLowerCase();
  const titleNorm = normalizeSearchTitle(titulo).toLowerCase();
  const rawTitleNorm = titulo.trim().toLowerCase();
  const a = (r.primary_artist?.name ?? "").toLowerCase();
  const t = (r.title ?? "").toLowerCase();

  let score = 0;
  if (a.includes(artistNorm) || artistNorm.includes(a)) score += 3;
  if (a === artistNorm) score += 2;
  if (t.includes(titleNorm) || titleNorm.includes(t)) score += 3;
  if (t.includes(rawTitleNorm) || rawTitleNorm.includes(t)) score += 2;
  if (t === titleNorm || t === rawTitleNorm) score += 2;
  return score;
}

async function searchGeniusSong(
  artista: string,
  titulo: string,
): Promise<{ id: number; url: string } | null> {
  if (!geniusEnabled()) return null;

  const allHits: GeniusSongHit[] = [];

  for (const query of searchQueries(artista, titulo)) {
    try {
      const hits = await searchGeniusOnce(query);
      for (const h of hits) {
        if (!allHits.some((x) => x.id === h.id)) allHits.push(h);
      }
      if (allHits.length >= 5) break;
    } catch {
      /* tenta próxima query */
    }
  }

  if (allHits.length === 0) return null;

  const ranked = allHits
    .map((r) => ({ id: r.id, url: r.url, score: scoreHit(r, artista, titulo) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < 2) return null;
  return { id: best.id, url: best.url };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\r/g, ""),
  )
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

function parsePreloadedState(html: string): unknown | null {
  const match = html.match(/window\.__PRELOADED_STATE__\s*=\s*JSON\.parse\('([\s\S]*?)'\)/);
  if (!match?.[1]) return null;
  try {
    const jsonStr = match[1]
      .replace(/\\u0027/g, "'")
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
    return JSON.parse(jsonStr) as unknown;
  } catch {
    return null;
  }
}

function lyricsFromPreloadedState(state: unknown): string | null {
  const songPage = (state as { songPage?: { lyricsData?: { body?: { html?: string } } } })
    .songPage;
  const html = songPage?.lyricsData?.body?.html;
  if (!html) return null;
  const text = stripHtml(html);
  return text.length >= 8 ? text : null;
}

function lyricsFromContainers(html: string): string | null {
  const containerRe = /data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi;
  const chunks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = containerRe.exec(html)) !== null) {
    const chunk = stripHtml(m[1] ?? "");
    if (chunk.length >= 20) chunks.push(chunk);
  }
  if (chunks.length === 0) return null;
  chunks.sort((a, b) => b.length - a.length);
  return chunks[0] ?? null;
}

async function fetchLyricsFromGeniusPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "User-Agent": PAGE_UA,
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const fromState = lyricsFromPreloadedState(parsePreloadedState(html));
    if (fromState) return fromState;

    return lyricsFromContainers(html);
  } catch {
    return null;
  }
}

async function fetchLyricsOvh(artista: string, titulo: string): Promise<string | null> {
  const paths = [
    [artista.trim(), normalizeSearchTitle(titulo)],
    [artista.trim(), titulo.trim()],
  ];
  for (const [artist, title] of paths) {
    if (!artist || !title) continue;
    try {
      const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { lyrics?: string; error?: string };
      const text = data.lyrics?.trim();
      if (text && text.length >= 8) return text;
    } catch {
      /* próxima tentativa */
    }
  }
  return null;
}

async function tryFallbackLyrics(
  artista: string,
  titulo: string,
  geniusMeta?: { url: string; id: number },
): Promise<LyricsFetchResult> {
  const az = await fetchAzlyricsLyrics(artista, titulo);
  if (az.ok) {
    return {
      ok: true,
      lyrics: az.lyrics,
      source: "azlyrics",
      lyricsUrl: az.url,
      geniusUrl: geniusMeta?.url,
      geniusId: geniusMeta?.id,
    };
  }

  const ovh = await fetchLyricsOvh(artista, titulo);
  if (ovh) {
    return {
      ok: true,
      lyrics: ovh,
      source: "lyrics_ovh",
      lyricsUrl: "",
      geniusUrl: geniusMeta?.url,
      geniusId: geniusMeta?.id,
    };
  }

  if (geniusMeta) {
    return { ok: false, reason: "no_lyrics", geniusUrl: geniusMeta.url, geniusId: geniusMeta.id };
  }
  return { ok: false, reason: "not_found" };
}

/** Genius → AZLyrics → lyrics.ovh. */
export async function fetchSongLyrics(artista: string, titulo: string): Promise<LyricsFetchResult> {
  let hit: { id: number; url: string } | null = null;
  try {
    hit = await searchGeniusSong(artista, titulo);
  } catch {
    return tryFallbackLyrics(artista, titulo);
  }

  if (!hit) {
    return tryFallbackLyrics(artista, titulo);
  }

  const lyrics = await fetchLyricsFromGeniusPage(hit.url);
  if (!lyrics) {
    return tryFallbackLyrics(artista, titulo, hit);
  }

  return {
    ok: true,
    lyrics,
    source: "genius_page",
    lyricsUrl: hit.url,
    geniusUrl: hit.url,
    geniusId: hit.id,
  };
}

/** @deprecated use fetchSongLyrics */
export async function fetchGeniusLyrics(
  artista: string,
  titulo: string,
): Promise<LyricsFetchResult> {
  return fetchSongLyrics(artista, titulo);
}
