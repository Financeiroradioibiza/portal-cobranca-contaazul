/**
 * Resolve «Artista - Música» para link Deezer.
 * Match automático só com alta confiança; senão devolve candidatos para escolha manual.
 */

const DZ_BASE = "https://api.deezer.com";
const UA = "RadioIbizaPortal/1.0 (download-link; contact@radioibiza.com.br)";
const DZ_FETCH_TIMEOUT_MS = 8_000;

const AUTO_PICK_MIN_SCORE = 92;
const CANDIDATE_MIN_SCORE = 48;

export type ParsedArtistTitle = { artista: string; titulo: string };

export type DeezerTrackCandidate = {
  trackId: number;
  url: string;
  title: string;
  artist: string;
  score: number;
};

export type DeezerTrackResolveResult =
  | { status: "resolved"; url: string; candidate: DeezerTrackCandidate }
  | { status: "pick"; parsed: ParsedArtistTitle; candidates: DeezerTrackCandidate[] }
  | { status: "not_found"; parsed: ParsedArtistTitle; candidates: DeezerTrackCandidate[] };

type DeezerTrackHit = {
  id?: number;
  link?: string;
  title?: string;
  artist?: { name?: string };
};

export function normalizeDownloadSearchLine(line: string): string {
  let s = line.trim();
  s = s.replace(/\.(mp3|flac|m4a|wav)$/i, "");
  s = s.replace(/~\d+$/i, "");
  s = s.replace(/\s*\(\d+\)\s*$/i, "");
  s = s.replace(/\s+/g, " ").trim();
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

function foldAccents(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function normalizeSearchTitle(titulo: string): string {
  return titulo
    .replace(/\s*\((?:part\.|part|feat\.|feat|ft\.|ft|featuring)[^)]*\)/gi, "")
    .replace(/\s*\([^)]*(?:official|video|audio|lyric|visualizer|mv|hd|4k|live)[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Título base para busca — remove sufixos de versão entre parênteses ou após hífen. */
export function coreTitleForMatch(titulo: string): string {
  let t = titulo.trim();
  t = t.replace(/\s*\([^)]*\)\s*$/g, " ");
  t = t.replace(/\s*[-–—]\s*(?:acoustic|acústic[ao]|live|remix|cover|edit|version|ver\.?|radio edit|bossa[^)]*)\s*$/gi, "");
  t = normalizeSearchTitle(t);
  return t.replace(/\s+/g, " ").trim();
}

function normalizeSearchArtist(artista: string): string {
  const trimmed = artista.trim();
  const alt = trimmed.replace(/^the\s+/i, "").trim();
  return alt || trimmed;
}

const STOP_WORDS = new Set(["the", "and", "of", "a", "o", "e", "de", "da", "do", "feat"]);

function titleWords(titulo: string): string[] {
  return coreTitleForMatch(titulo)
    .split(/\s+/)
    .map((w) => foldAccents(w))
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function artistMatches(want: string, got: string): boolean {
  const a = foldAccents(normalizeSearchArtist(want));
  const b = foldAccents(normalizeSearchArtist(got));
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && (b.includes(a) || a.includes(b))) return true;
  const aParts = a.split(/\s+/).filter(Boolean);
  const bParts = b.split(/\s+/).filter(Boolean);
  if (aParts[0] && bParts[0] && aParts[0]!.length >= 3 && aParts[0] === bParts[0]) {
    const aLast = aParts[aParts.length - 1];
    const bLast = bParts[bParts.length - 1];
    if (aLast && bLast && aLast.length >= 4 && (bLast.includes(aLast) || aLast.includes(bLast))) return true;
  }
  return false;
}

function titleMatches(want: string, got: string): { ok: boolean; ratio: number } {
  const wantCore = foldAccents(coreTitleForMatch(want));
  const gotCore = foldAccents(coreTitleForMatch(got));
  if (!wantCore || !gotCore) return { ok: false, ratio: 0 };
  if (wantCore === gotCore) return { ok: true, ratio: 1 };
  if (wantCore.length >= 5 && gotCore.includes(wantCore)) return { ok: true, ratio: 0.92 };
  if (gotCore.length >= 5 && wantCore.includes(gotCore)) return { ok: true, ratio: 0.88 };

  const words = titleWords(want);
  if (words.length === 0) return { ok: false, ratio: 0 };
  const matched = words.filter((w) => gotCore.includes(w));
  const ratio = matched.length / words.length;
  const ok = ratio >= 0.55 && matched.length >= 1;
  return { ok, ratio };
}

export function scoreDeezerHit(input: ParsedArtistTitle, hit: DeezerTrackHit): number {
  const hitTitle = hit.title?.trim() ?? "";
  const hitArtist = hit.artist?.name?.trim() ?? "";
  if (!hitTitle || !hitArtist) return 0;
  if (!artistMatches(input.artista, hitArtist)) return 0;

  const { ok, ratio } = titleMatches(input.titulo, hitTitle);
  if (!ok) return 0;

  let score = 70 + Math.round(ratio * 25);
  const wantCore = foldAccents(coreTitleForMatch(input.titulo));
  const gotCore = foldAccents(coreTitleForMatch(hitTitle));
  if (wantCore === gotCore) score = 100;
  else if (foldAccents(normalizeSearchArtist(input.artista)) === foldAccents(normalizeSearchArtist(hitArtist))) {
    score += 3;
  }
  return Math.min(100, score);
}

function hitToCandidate(hit: DeezerTrackHit, score: number): DeezerTrackCandidate | null {
  if (!hit.id) return null;
  const url = hit.link ?? `https://www.deezer.com/track/${hit.id}`;
  return {
    trackId: hit.id,
    url,
    title: hit.title?.trim() || "—",
    artist: hit.artist?.name?.trim() || "—",
    score,
  };
}

async function dzFetch(path: string): Promise<{ data?: DeezerTrackHit[] } | null> {
  try {
    const res = await fetch(`${DZ_BASE}${path}`, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(DZ_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as { data?: DeezerTrackHit[] };
  } catch {
    return null;
  }
}

function mergeDeezerHits(searches: ({ data?: DeezerTrackHit[] } | null)[]): DeezerTrackHit[] {
  const seen = new Set<number>();
  const hits: DeezerTrackHit[] = [];
  for (const search of searches) {
    for (const t of search?.data ?? []) {
      if (t.id && !seen.has(t.id)) {
        seen.add(t.id);
        hits.push(t);
      }
    }
  }
  return hits;
}

async function searchDeezerTracks(input: ParsedArtistTitle): Promise<DeezerTrackHit[]> {
  const core = coreTitleForMatch(input.titulo);
  const artista = input.artista.trim();
  const artistaAlt = normalizeSearchArtist(artista);
  const words = titleWords(input.titulo);
  const shortQuery = words.slice(0, 5).join(" ");

  const queries = [
    `artist:"${artista}" track:"${core}"`,
    `${artista} ${core}`,
    shortQuery && shortQuery !== core ? `${artista} ${shortQuery}` : null,
    artistaAlt !== artista ? `${artistaAlt} ${core}` : null,
  ].filter((q): q is string => Boolean(q?.trim()));

  const searches = await Promise.all(
    queries.map((q) => {
      const structured = q.includes('"') || q.includes("track:") || q.includes("artist:");
      const path = structured
        ? `/search?q=${encodeURIComponent(q)}&limit=10`
        : `/search/track?q=${encodeURIComponent(q)}&limit=10`;
      return dzFetch(path);
    }),
  );

  return mergeDeezerHits(searches);
}

function versionHintFromTitle(titulo: string): string {
  const m = titulo.match(/\(([^)]+)\)\s*$/);
  if (!m?.[1]) return "";
  return m[1]
    .replace(/\b(?:version|ver\.?|edit)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function versionWords(titulo: string): string[] {
  const hint = versionHintFromTitle(titulo);
  if (!hint) return [];
  return hint
    .split(/\s+/)
    .map((w) => foldAccents(w))
    .filter((w) => w.length > 3);
}

function versionWordsMatchRatio(wantTitle: string, gotTitle: string): number {
  const words = versionWords(wantTitle);
  if (words.length === 0) return 1;
  const got = foldAccents(gotTitle);
  const matched = words.filter((w) => got.includes(w));
  return matched.length / words.length;
}

async function searchDeezerByTitle(input: ParsedArtistTitle): Promise<DeezerTrackHit[]> {
  const core = coreTitleForMatch(input.titulo);
  const versionHint = versionHintFromTitle(input.titulo);
  const words = titleWords(input.titulo);
  const shortQuery = words.slice(0, 6).join(" ");

  const queries = [
    versionHint ? `${core} ${versionHint}` : null,
    shortQuery || core,
  ].filter((q): q is string => Boolean(q?.trim()));

  const searches = await Promise.all(
    queries.map((q) => dzFetch(`/search/track?q=${encodeURIComponent(q)}&limit=12`)),
  );

  return mergeDeezerHits(searches);
}

function rankTitleFallbackCandidates(
  input: ParsedArtistTitle,
  hits: DeezerTrackHit[],
): DeezerTrackCandidate[] {
  const out: DeezerTrackCandidate[] = [];
  for (const hit of hits) {
    const hitTitle = hit.title?.trim() ?? "";
    const hitArtist = hit.artist?.name?.trim() ?? "";
    if (!hitTitle || !hitArtist) continue;

    const { ok, ratio } = titleMatches(input.titulo, hitTitle);
    if (!ok) continue;

    const versionRatio = versionWordsMatchRatio(input.titulo, hitTitle);
    if (versionWords(input.titulo).length > 0 && versionRatio < 0.5) continue;

    let score = 45 + Math.round(ratio * 30) + Math.round(versionRatio * 20);
    if (artistMatches(input.artista, hitArtist)) score += 15;
    if (score < CANDIDATE_MIN_SCORE) continue;

    const c = hitToCandidate(hit, Math.min(88, score));
    if (c) out.push(c);
  }
  out.sort((a, b) => b.score - a.score);
  const seen = new Set<number>();
  return out.filter((c) => {
    if (seen.has(c.trackId)) return false;
    seen.add(c.trackId);
    return true;
  });
}
function rankArtistCandidates(input: ParsedArtistTitle, hits: DeezerTrackHit[]): DeezerTrackCandidate[] {
  const out: DeezerTrackCandidate[] = [];
  for (const hit of hits) {
    const score = scoreDeezerHit(input, hit);
    if (score < CANDIDATE_MIN_SCORE) continue;
    const c = hitToCandidate(hit, score);
    if (c) out.push(c);
  }
  out.sort((a, b) => b.score - a.score);
  const seen = new Set<number>();
  return out.filter((c) => {
    if (seen.has(c.trackId)) return false;
    seen.add(c.trackId);
    return true;
  });
}

/** Resolve texto ou devolve candidatos para escolha manual. */
export async function resolveDeezerTrackFromText(line: string): Promise<DeezerTrackResolveResult> {
  const parsed = parseArtistTitleFromLine(line);
  if (!parsed) {
    throw new Error(
      "Use o formato «Artista - Música» (primeiro hífen separa artista) ou cole link deezer.com/track/…",
    );
  }

  const hits = await searchDeezerTracks(parsed);
  let candidates = rankArtistCandidates(parsed, hits);

  if (candidates.length === 0) {
    const titleHits = await searchDeezerByTitle(parsed);
    candidates = rankTitleFallbackCandidates(parsed, titleHits);
  }

  candidates = candidates.slice(0, 10);

  if (candidates[0] && candidates[0].score >= AUTO_PICK_MIN_SCORE) {
    return { status: "resolved", url: candidates[0].url, candidate: candidates[0] };
  }

  if (candidates.length > 0) {
    return { status: "pick", parsed, candidates };
  }

  return { status: "not_found", parsed, candidates: [] };
}

/** Atalho: resolve ou lança erro (compat). */
export async function resolveDeezerTrackUrlFromText(line: string): Promise<string> {
  const result = await resolveDeezerTrackFromText(line);
  if (result.status === "resolved") return result.url;
  if (result.status === "pick") {
    throw new Error(
      `Várias faixas possíveis para «${result.parsed.artista} — ${result.parsed.titulo}» — escolha na lista do lote.`,
    );
  }
  throw new Error(
    `Nenhuma faixa no Deezer com artista «${result.parsed.artista}» e título «${result.parsed.titulo}» — confira ortografia ou cole o link da faixa.`,
  );
}
