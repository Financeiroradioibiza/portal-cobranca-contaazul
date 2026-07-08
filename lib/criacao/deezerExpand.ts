import type { ParsedDownloadLine } from "@/lib/criacao/downloadParse";
import {
  normalizeForDeemixInput,
  resolveDeezerShareUrl,
  toCanonicalDeemixUrl,
} from "@/lib/criacao/deezerCanonical";
import { resolveDeezerTrackUrlFromText } from "@/lib/criacao/deezerTrackMatch";

type DeezerTrackLink = { link?: string; title?: string; artist?: { name?: string } };

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
      const canonical = t.link ? toCanonicalDeemixUrl(t.link) : null;
      if (canonical?.kind === "track") links.push(canonical.url);
      else if (t.link) links.push(t.link);
      if (links.length >= maxTracks) break;
    }
    url = data.next ?? null;
  }

  return links;
}

/**
 * Prepara linhas para o worker Deemix:
 * - link.deezer.com → URL canônica www.deezer.com/…
 * - playlist/album → uma linha por faixa (URLs track canônicas)
 * - track → URL canônica
 * - texto «Artista - Música» → URL track via API Deezer (exige match de artista)
 */
export async function expandDeezerDownloadLines(lines: ParsedDownloadLine[]): Promise<ParsedDownloadLine[]> {
  const out: ParsedDownloadLine[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const resolved = await resolveDeezerShareUrl(line.linhaOriginal);
    const canonical = toCanonicalDeemixUrl(resolved);

    if (canonical?.kind === "playlist") {
      const trackLinks = await fetchDeezerPaginatedTracks(`/playlist/${canonical.id}/tracks`);
      if (trackLinks.length === 0) {
        throw new Error(`Playlist Deezer vazia ou privada (${canonical.url})`);
      }
      for (const link of trackLinks) {
        const key = link.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ linhaOriginal: link, inputTipo: "url" });
      }
      continue;
    }

    if (canonical?.kind === "album") {
      const trackLinks = await fetchDeezerPaginatedTracks(`/album/${canonical.id}/tracks`);
      if (trackLinks.length === 0) {
        throw new Error(`Álbum Deezer vazio ou privado (${canonical.url})`);
      }
      for (const link of trackLinks) {
        const key = link.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ linhaOriginal: link, inputTipo: "url" });
      }
      continue;
    }

    if (canonical?.kind === "track") {
      const key = canonical.url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ linhaOriginal: canonical.url, inputTipo: "url" });
      continue;
    }

    if (line.inputTipo === "texto") {
      const trackUrl = await resolveDeezerTrackUrlFromText(line.linhaOriginal);
      const key = trackUrl.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ linhaOriginal: trackUrl, inputTipo: "url" });
      continue;
    }

    const normalized = await normalizeForDeemixInput(line.linhaOriginal);
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      linhaOriginal: normalized,
      inputTipo: toCanonicalDeemixUrl(normalized) ? "url" : line.inputTipo,
    });
  }

  return out;
}

export { resolveDeezerShareUrl, toCanonicalDeemixUrl, normalizeForDeemixInput } from "@/lib/criacao/deezerCanonical";
