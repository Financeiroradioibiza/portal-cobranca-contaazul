const PAGE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const AZ_BASE = "https://www.azlyrics.com/lyrics";

export type AzlyricsLyricsResult =
  | { ok: true; lyrics: string; url: string }
  | { ok: false; reason: "not_found" | "no_lyrics" | "fetch_error" };

/** Slug AZLyrics: minúsculas, sem acentos/pontuação. */
export function azlyricsSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
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

function extractAzlyricsBody(html: string): string | null {
  const marker = "Usage of azlyrics.com content";
  const i = html.indexOf(marker);
  if (i < 0) return null;

  const after = html.slice(i);
  const endComment = after.indexOf("-->");
  if (endComment < 0) return null;

  let chunk = after.slice(endComment + 3);
  const stops = [
    '<div id="azlyrics_mast',
    "<!-- MxM",
    "<script",
    "<footer",
    '<div class="smt',
    '<div id="comment',
  ];
  let end = chunk.length;
  for (const s of stops) {
    const p = chunk.indexOf(s);
    if (p >= 0 && p < end) end = p;
  }
  chunk = chunk.slice(0, end);

  const text = decodeHtmlEntities(
    chunk
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\r/g, ""),
  )
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  return text.length >= 8 ? text : null;
}

function artistSlugVariants(artista: string): string[] {
  const raw = artista.trim();
  const primary = raw.split(/\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0]?.trim() ?? raw;
  const variants = new Set<string>();
  for (const a of [raw, primary, primary.replace(/^the\s+/i, "")]) {
    const slug = azlyricsSlug(a);
    if (slug.length >= 2) variants.add(slug);
  }
  return [...variants];
}

function titleSlugVariants(titulo: string): string[] {
  const raw = titulo.trim();
  const noParen = raw.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const variants = new Set<string>();
  for (const t of [raw, noParen]) {
    const slug = azlyricsSlug(t);
    if (slug.length >= 2) variants.add(slug);
  }
  return [...variants];
}

async function fetchAzlyricsUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,pt;q=0.8",
        "User-Agent": PAGE_UA,
      },
      signal: AbortSignal.timeout(18_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (/not found|404|doesn't exist/i.test(html.slice(0, 2000))) return null;
    return extractAzlyricsBody(html);
  } catch {
    return null;
  }
}

/** Busca letra no AZLyrics (scraping — sem API oficial). */
export async function fetchAzlyricsLyrics(
  artista: string,
  titulo: string,
): Promise<AzlyricsLyricsResult> {
  const artists = artistSlugVariants(artista);
  const titles = titleSlugVariants(titulo);
  if (artists.length === 0 || titles.length === 0) {
    return { ok: false, reason: "not_found" };
  }

  try {
    for (const artist of artists) {
      for (const title of titles) {
        const url = `${AZ_BASE}/${artist}/${title}.html`;
        const lyrics = await fetchAzlyricsUrl(url);
        if (lyrics) return { ok: true, lyrics, url };
        await new Promise((r) => setTimeout(r, 350));
      }
    }
    return { ok: false, reason: "not_found" };
  } catch {
    return { ok: false, reason: "fetch_error" };
  }
}
