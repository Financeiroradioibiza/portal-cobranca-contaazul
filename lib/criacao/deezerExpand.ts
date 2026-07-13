import type { ParsedDownloadLine } from "@/lib/criacao/downloadParse";
import { isSpotifyUrl } from "@/lib/criacao/downloadParse";
import {
  normalizeForDeemixInput,
  resolveDeezerShareUrl,
  toCanonicalDeemixUrl,
} from "@/lib/criacao/deezerCanonical";
import {
  resolveDeezerTrackFromText,
  type DeezerTrackCandidate,
} from "@/lib/criacao/deezerTrackMatch";
import { resolveSpotifyUrl, spotifyConfigured } from "@/lib/criacao/spotifyClient";

export type ExpandedDownloadLine = ParsedDownloadLine & {
  pickCandidates?: DeezerTrackCandidate[];
  expandError?: string;
};

type DeezerTrackLink = { link?: string; title?: string; artist?: { name?: string } };

const LINE_CONCURRENCY = 6;
const SPOTIFY_TRACK_CONCURRENCY = 4;
const PLAYLIST_FETCH_TIMEOUT_MS = 12_000;
const MAX_SPOTIFY_TRACKS = 300;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const idx = next;
      next += 1;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]!, idx);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, () => worker()),
  );
  return results;
}

async function fetchDeezerPaginatedTracks(path: string, maxTracks = 300): Promise<string[]> {
  const links: string[] = [];
  let url: string | null = `https://api.deezer.com${path}?limit=100`;

  while (url && links.length < maxTracks) {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(PLAYLIST_FETCH_TIMEOUT_MS),
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

function errorLine(line: ParsedDownloadLine, message: string): ExpandedDownloadLine {
  return {
    linhaOriginal: line.linhaOriginal,
    inputTipo: line.inputTipo,
    expandError: message,
  };
}

async function expandDeezerLineCore(line: ParsedDownloadLine): Promise<ExpandedDownloadLine[]> {
  try {
    const resolved = await resolveDeezerShareUrl(line.linhaOriginal);
    const canonical = toCanonicalDeemixUrl(resolved);

    if (canonical?.kind === "playlist") {
      const trackLinks = await fetchDeezerPaginatedTracks(`/playlist/${canonical.id}/tracks`);
      if (trackLinks.length === 0) {
        return [errorLine(line, `Playlist Deezer vazia ou privada (${canonical.url})`)];
      }
      return trackLinks.map((link) => ({ linhaOriginal: link, inputTipo: "url" as const }));
    }

    if (canonical?.kind === "album") {
      const trackLinks = await fetchDeezerPaginatedTracks(`/album/${canonical.id}/tracks`);
      if (trackLinks.length === 0) {
        return [errorLine(line, `Álbum Deezer vazio ou privado (${canonical.url})`)];
      }
      return trackLinks.map((link) => ({ linhaOriginal: link, inputTipo: "url" as const }));
    }

    if (canonical?.kind === "track") {
      return [{ linhaOriginal: canonical.url, inputTipo: "url" }];
    }

    if (line.inputTipo === "texto") {
      let result;
      try {
        result = await resolveDeezerTrackFromText(line.linhaOriginal);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "erro_busca_deezer";
        return [errorLine(line, msg)];
      }

      if (result.status === "resolved") {
        return [{ linhaOriginal: result.url, inputTipo: "url" }];
      }

      const candidates =
        result.status === "pick" ? result.candidates
        : result.candidates.length > 0 ? result.candidates
        : null;

      if (candidates?.length) {
        return [{
          linhaOriginal: line.linhaOriginal,
          inputTipo: "texto",
          pickCandidates: candidates,
        }];
      }

      return [
        errorLine(
          line,
          `Nenhuma faixa no Deezer com artista «${result.parsed.artista}» e título «${result.parsed.titulo}» — confira ortografia ou cole o link da faixa.`,
        ),
      ];
    }

    const normalized = await normalizeForDeemixInput(line.linhaOriginal);
    return [{
      linhaOriginal: normalized,
      inputTipo: toCanonicalDeemixUrl(normalized) ? "url" : line.inputTipo,
    }];
  } catch (e) {
    const msg = e instanceof Error ? e.message : "expand_falhou";
    return [errorLine(line, msg)];
  }
}

async function spotifyTrackToDeezerLine(
  artist: string,
  title: string,
  sourceRef: string,
): Promise<ExpandedDownloadLine> {
  const textLine = `${artist.trim()} - ${title.trim()}`;
  try {
    const result = await resolveDeezerTrackFromText(textLine);
    if (result.status === "resolved") {
      return { linhaOriginal: result.url, inputTipo: "url" };
    }
    const candidates =
      result.status === "pick" ? result.candidates
      : result.candidates.length > 0 ? result.candidates
      : null;
    if (candidates?.length) {
      return {
        linhaOriginal: `${textLine} · ${sourceRef}`,
        inputTipo: "texto",
        pickCandidates: candidates,
      };
    }
    return {
      linhaOriginal: textLine,
      inputTipo: "texto",
      expandError: `Spotify «${artist} — ${title}»: nenhuma faixa equivalente no Deezer.`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro_match_deezer";
    return {
      linhaOriginal: textLine,
      inputTipo: "texto",
      expandError: `Spotify «${artist} — ${title}»: ${msg}`,
    };
  }
}

async function expandSpotifyLine(line: ParsedDownloadLine): Promise<ExpandedDownloadLine[]> {
  if (!spotifyConfigured()) {
    return [
      errorLine(
        line,
        "Leitura Spotify não configurada no portal — defina SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET no Netlify.",
      ),
    ];
  }

  let tracks;
  try {
    tracks = await resolveSpotifyUrl(line.linhaOriginal);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "spotify_falhou";
    if (msg === "invalid_spotify_url") {
      return [errorLine(line, "Link Spotify inválido — use playlist, álbum ou faixa (open.spotify.com).")];
    }
    if (msg === "spotify_auth_failed" || msg === "spotify_not_configured") {
      return [errorLine(line, "Não foi possível autenticar na API do Spotify — confira SPOTIFY_CLIENT_ID/SECRET.")];
    }
    return [errorLine(line, `Spotify: ${msg}`)];
  }

  if (tracks.length === 0) {
    return [errorLine(line, "Playlist/álbum Spotify vazio ou inacessível (precisa ser público).")];
  }

  const slice = tracks.slice(0, MAX_SPOTIFY_TRACKS);
  const expanded = await mapWithConcurrency(slice, SPOTIFY_TRACK_CONCURRENCY, (t) =>
    spotifyTrackToDeezerLine(t.artist, t.title, t.sourceRef ?? ""),
  );

  if (tracks.length > MAX_SPOTIFY_TRACKS) {
    expanded.push(
      errorLine(
        line,
        `Spotify: só as primeiras ${MAX_SPOTIFY_TRACKS} faixas foram convertidas (${tracks.length} no total).`,
      ),
    );
  }

  return expanded;
}

async function expandOneLine(line: ParsedDownloadLine): Promise<ExpandedDownloadLine[]> {
  if (isSpotifyUrl(line.linhaOriginal)) {
    return expandSpotifyLine(line);
  }
  return expandDeezerLineCore(line);
}

/**
 * Prepara linhas para o worker Deemix:
 * - link Spotify (playlist/álbum/faixa) → match faixa a faixa no Deezer
 * - link.deezer.com → URL canônica www.deezer.com/…
 * - playlist/album Deezer → uma linha por faixa (URLs track canônicas)
 * - track → URL canônica
 * - texto «Artista - Música» → resolve via API Deezer (auto, escolha manual ou erro por linha)
 */
export async function expandDeezerDownloadLines(lines: ParsedDownloadLine[]): Promise<ExpandedDownloadLine[]> {
  const chunks = await mapWithConcurrency(lines, LINE_CONCURRENCY, expandOneLine);
  const out: ExpandedDownloadLine[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    for (const item of chunk) {
      if (item.expandError || item.pickCandidates?.length) {
        out.push(item);
        continue;
      }
      const key = item.linhaOriginal.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }

  return out;
}

export { resolveDeezerShareUrl, toCanonicalDeemixUrl, normalizeForDeemixInput } from "@/lib/criacao/deezerCanonical";
