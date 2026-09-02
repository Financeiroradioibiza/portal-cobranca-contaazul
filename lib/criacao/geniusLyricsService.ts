import { normalizeSearchTitle } from "@/lib/criacao/tagEnrichmentCore";

const GENIUS_BASE = "https://api.genius.com";
const UA = "RadioIbizaPortal/1.0 (criacao-explicito; contact@radioibiza.com.br)";

export type GeniusLyricsResult =
  | { ok: true; lyrics: string; geniusUrl: string; geniusId: number }
  | { ok: false; reason: "no_token" | "not_found" | "no_lyrics" | "fetch_error" };

export function geniusEnabled(): boolean {
  return Boolean(process.env.GENIUS_ACCESS_TOKEN?.trim());
}

function authHeaders(): HeadersInit {
  const token = process.env.GENIUS_ACCESS_TOKEN?.trim();
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "User-Agent": UA,
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

async function searchGeniusSong(
  artista: string,
  titulo: string,
): Promise<{ id: number; url: string } | null> {
  const q = `${artista.trim()} ${normalizeSearchTitle(titulo)}`.trim();
  if (!q) return null;

  try {
    const res = await fetch(
      `${GENIUS_BASE}/search?q=${encodeURIComponent(q)}`,
      { headers: authHeaders(), signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: { hits?: GeniusSearchHit[] } };
    const hits = data.response?.hits ?? [];
    if (hits.length === 0) return null;

    const artistNorm = artista.trim().toLowerCase();
    const titleNorm = normalizeSearchTitle(titulo).toLowerCase();

    const ranked = hits
      .map((h) => h.result)
      .filter((r): r is NonNullable<GeniusSearchHit["result"]> => Boolean(r?.id && r.url))
      .map((r) => {
        const a = (r.primary_artist?.name ?? "").toLowerCase();
        const t = (r.title ?? "").toLowerCase();
        let score = 0;
        if (a.includes(artistNorm) || artistNorm.includes(a)) score += 2;
        if (t.includes(titleNorm) || titleNorm.includes(t)) score += 2;
        if (a === artistNorm) score += 1;
        if (t === titleNorm) score += 1;
        return { id: r.id!, url: r.url!, score };
      })
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (!best) return null;
    return { id: best.id, url: best.url };
  } catch {
    return null;
  }
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

async function fetchLyricsFromPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/html", "User-Agent": UA },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const containerRe = /data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi;
    const parts: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = containerRe.exec(html)) !== null) {
      const chunk = stripHtml(m[1] ?? "");
      if (chunk) parts.push(chunk);
    }
    if (parts.length > 0) {
      return parts.join("\n\n").trim();
    }

    const preloaded = html.match(/window\.__PRELOADED_STATE__\s*=\s*JSON\.parse\('([\s\S]*?)'\)/);
    if (preloaded?.[1]) {
      try {
        const jsonStr = preloaded[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        const state = JSON.parse(jsonStr) as {
          songPage?: { lyrics?: { html?: string } | string };
        };
        const lyrics = state.songPage?.lyrics;
        if (typeof lyrics === "string" && lyrics.trim()) return lyrics.trim();
        if (lyrics && typeof lyrics === "object" && lyrics.html) {
          const text = stripHtml(lyrics.html);
          if (text) return text;
        }
      } catch {
        /* fallback abaixo */
      }
    }

    return null;
  } catch {
    return null;
  }
}

/** Busca letra no Genius (API + página pública). */
export async function fetchGeniusLyrics(
  artista: string,
  titulo: string,
): Promise<GeniusLyricsResult> {
  if (!geniusEnabled()) return { ok: false, reason: "no_token" };

  const hit = await searchGeniusSong(artista, titulo);
  if (!hit) return { ok: false, reason: "not_found" };

  const lyrics = await fetchLyricsFromPage(hit.url);
  if (!lyrics || lyrics.length < 8) return { ok: false, reason: "no_lyrics" };

  return { ok: true, lyrics, geniusUrl: hit.url, geniusId: hit.id };
}
