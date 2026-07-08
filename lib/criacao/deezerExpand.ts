import type { ParsedDownloadLine } from "@/lib/criacao/downloadParse";

const PLAYLIST_RE = /deezer\.com\/(?:[a-z]{2}\/)?playlist\/(\d+)/i;
const ALBUM_RE = /deezer\.com\/(?:[a-z]{2}\/)?album\/(\d+)/i;
const DEEZER_SHARE_RE = /^https?:\/\/link\.deezer\.com\//i;

type DeezerTrackLink = { link?: string; title?: string; artist?: { name?: string } };

/** Segue redirects de link.deezer.com/s/… até www.deezer.com/track|playlist|album/… */
export async function resolveDeezerShareUrl(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!DEEZER_SHARE_RE.test(trimmed)) return trimmed;

  const res = await fetch(trimmed, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: {
      Accept: "text/html,application/json",
      "User-Agent": "RadioIbizaPortal/1.0 (download-link)",
    },
  });
  const finalUrl = res.url?.trim();
  if (finalUrl && /deezer\.com\/(?:[a-z]{2}\/)?(track|album|playlist)\/\d+/i.test(finalUrl)) {
    return finalUrl.split("#")[0]!;
  }
  throw new Error(
    "Link curto Deezer não resolveu para uma faixa/playlist — cole o link completo deezer.com/…",
  );
}

async function fetchDeezerPaginatedTracks(path: string, maxTracks = 300): Promise<string[]> {
  const links: string[] = [];
  let url: string | null = `https://api.deezer.com${path}?limit=100`;

  while (url && links.length < maxTracks) {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`API Deezer respondeu HTTP ${res.status} para ${path}`);
    }
    const data = (await res.json()) as {
      data?: DeezerTrackLink[];
      next?: string | null;
      error?: { message?: string };
    };
    if (data.error?.message) {
      throw new Error(`Playlist/album Deezer inacessível: ${data.error.message}`);
    }
    for (const t of data.data ?? []) {
      if (t.link) links.push(t.link);
      if (links.length >= maxTracks) break;
    }
    url = data.next ?? null;
  }

  return links;
}

/**
 * Expande links de playlist/album Deezer em links de faixa (api.deezer.com).
 * Mantém tracks e buscas por texto como estão.
 */
export async function expandDeezerDownloadLines(lines: ParsedDownloadLine[]): Promise<ParsedDownloadLine[]> {
  const out: ParsedDownloadLine[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const resolved = await resolveDeezerShareUrl(line.linhaOriginal);
    const playlistId = PLAYLIST_RE.exec(resolved)?.[1];
    const albumId = !playlistId ? ALBUM_RE.exec(resolved)?.[1] : null;

    let trackLinks: string[] | null = null;
    if (playlistId) {
      trackLinks = await fetchDeezerPaginatedTracks(`/playlist/${playlistId}/tracks`);
      if (trackLinks.length === 0) {
        throw new Error(`Playlist Deezer vazia ou privada: ${resolved}`);
      }
    } else if (albumId) {
      trackLinks = await fetchDeezerPaginatedTracks(`/album/${albumId}/tracks`);
      if (trackLinks.length === 0) {
        throw new Error(`Álbum Deezer vazio ou privado: ${resolved}`);
      }
    }

    if (trackLinks) {
      for (const link of trackLinks) {
        const key = link.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ linhaOriginal: link, inputTipo: "url" });
      }
      continue;
    }

    const key = resolved.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      linhaOriginal: resolved,
      inputTipo: /^https?:\/\/(?:www\.)?deezer\.com\//i.test(resolved) ? "url" : line.inputTipo,
    });
  }

  return out;
}
