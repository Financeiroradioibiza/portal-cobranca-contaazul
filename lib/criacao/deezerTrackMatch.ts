/**
 * Resolve «Artista - Música» para link Deezer.
 * Match automático só com alta confiança; senão devolve candidatos para escolha manual.
 */

const DZ_BASE = "https://api.deezer.com";
const UA = "RadioIbizaPortal/1.0 (download-link; contact@radioibiza.com.br)";
const DZ_FETCH_TIMEOUT_MS = 8_000;

const AUTO_PICK_MIN_SCORE = 92;
const CANDIDATE_MIN_SCORE = 48;
/** Mínimo de parecença de artista para listar candidato (ex.: Sabib ≈ Sarbib passa; Michael Bublé não). */
export const ARTIST_SIM_PICK_MIN = 0.42;
/** Artista considerado “match” com typo leve (1–2 letras). */
export const ARTIST_SIM_MATCH_MIN = 0.72;
/** Servidor UP: artista principal legado tem de bater no Deezer (sem «mesmo título, artista errado»). */
export const ARTIST_SIM_SERVIDOR_UP_MIN = 0.82;

export type ParsedArtistTitle = { artista: string; titulo: string };

export type DeezerTrackCandidate = {
  trackId: number;
  url: string;
  title: string;
  artist: string;
  score: number;
  /** Segundos — preenchido na busca Deezer quando disponível. */
  durationSec?: number | null;
};

export type DeezerTrackResolveResult =
  | { status: "resolved"; url: string; candidate: DeezerTrackCandidate }
  | { status: "pick"; parsed: ParsedArtistTitle; candidates: DeezerTrackCandidate[] }
  | { status: "not_found"; parsed: ParsedArtistTitle; candidates: DeezerTrackCandidate[] };

type DeezerTrackHit = {
  id?: number;
  link?: string;
  title?: string;
  duration?: number;
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

/** Corrige metadados típicos de MP3 legado (apóstrofo perdido, ft, etc.). */
export function normalizeLegacyFilenameForSearch(line: string): string {
  let s = normalizeDownloadSearchLine(line);
  const fixes: Array<[RegExp, string]> = [
    [/\bDon t\b/gi, "Don't"],
    [/\bIm Good\b/gi, "I'm Good"],
    [/\bCant\b/gi, "Can't"],
    [/\bWont\b/gi, "Won't"],
    [/\bI ve\b/gi, "I've"],
    [/\bS cara\b/gi, "Sócara"],
    [/\bAqui Ali\b/gi, "Aqui, Ali"],
  ];
  for (const [re, rep] of fixes) s = s.replace(re, rep);
  s = s.replace(/\sft\s/gi, " feat. ");
  return s.replace(/\s+/g, " ").trim();
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

/** Variante sem acento para a API Deezer (legado costuma omitir ç, ã, é…). */
function accentStripForSearch(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
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

/** Primeiro artista do legado — antes de « e », « & » ou feat (sempre o nome principal). */
export function primaryLegacyArtist(artista: string): string {
  let s = artista
    .trim()
    .replace(/\s+(?:ft\.?|feat\.?|featuring)\s+.*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const ptDuet = s.match(/^(.+?)\s+e\s+(.+)$/i);
  if (ptDuet?.[1]?.trim() && ptDuet[2]?.trim()) {
    const leftWords = ptDuet[1].trim().split(/\s+/).filter(Boolean);
    if (leftWords.length >= 2) s = ptDuet[1].trim();
  }

  const ampDuet = s.match(/^(.+?)\s*&\s+/);
  if (ampDuet?.[1]?.trim()) s = ampDuet[1].trim();

  return s;
}

/**
 * Servidor UP: artista principal legado = artista no Deezer (nome completo do 1º artista).
 */
export function strictPrimaryArtistMatch(legacyArtist: string, deezerArtist: string): boolean {
  const primary = primaryLegacyArtist(legacyArtist);
  const got = deezerArtist.trim();
  if (!primary || !got) return false;

  const pKey = normalizeArtistKey(primary);
  const gKey = normalizeArtistKey(got);
  if (!pKey || !gKey) return false;

  if (pKey === gKey) return true;
  if (gKey.startsWith(`${pKey} `)) return true;

  const pParts = pKey.split(/\s+/).filter(Boolean);
  const gParts = gKey.split(/\s+/).filter(Boolean);
  if (pParts.length === 0 || gParts.length === 0) return false;

  const pFirst = pParts[0]!;
  const gFirst = gParts[0]!;
  if (pFirst.length >= 3 && gFirst.length >= 3 && pFirst !== gFirst) {
    return false;
  }

  if (pParts.length >= 2) {
    const gLead = gParts.slice(0, pParts.length).join(" ");
    if (stringSimilarity(pKey, gLead) >= ARTIST_SIM_SERVIDOR_UP_MIN) return true;

    const pLast = pParts[pParts.length - 1]!;
    const gLast = gParts[gParts.length - 1]!;
    if (pLast.length >= 3 && gLast.length >= 3 && pLast !== gLast) {
      return false;
    }
  }

  return stringSimilarity(pKey, gKey) >= ARTIST_SIM_SERVIDOR_UP_MIN;
}

/** Artista principal — remove feat/ft; dupla «A & B» usa o primeiro nome quando há sobrenome. */
export function primaryArtistForMatch(artista: string): string {
  let s = artista
    .replace(/\s+(?:ft\.?|feat\.?|featuring)\s+.*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const duet = s.match(/^(.+?)\s*&\s+(.+)$/);
  if (duet?.[1]?.trim() && duet[2]!.trim().length >= 3) {
    const leftWords = duet[1].trim().split(/\s+/).filter(Boolean);
    if (leftWords.length >= 2) s = duet[1]!.trim();
  }
  return s;
}

function normalizeArtistKey(artista: string): string {
  return foldAccents(normalizeSearchArtist(artista))
    .replace(/\./g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function artistTokens(artista: string): string[] {
  return normalizeArtistKey(primaryArtistForMatch(artista))
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length]!;
}

function stringSimilarity(a: string, b: string): number {
  const x = a.trim();
  const y = b.trim();
  if (!x || !y) return 0;
  if (x === y) return 1;
  const dist = levenshtein(x, y);
  return 1 - dist / Math.max(x.length, y.length);
}

function artistNameParts(artista: string): string[] {
  return normalizeArtistKey(primaryArtistForMatch(artista)).split(/\s+/).filter(Boolean);
}

/** 0–1 — tolera typo no sobrenome (Sabib → Sarbib) se o primeiro nome bater. */
export function artistSimilarity(want: string, got: string): number {
  const wantVariants = [
    want,
    primaryArtistForMatch(want),
    normalizeSearchArtist(want),
    normalizeSearchArtist(primaryArtistForMatch(want)),
  ].filter((v, i, a) => v.trim() && a.indexOf(v) === i);

  let best = 0;
  for (const variant of wantVariants) {
    const wKey = normalizeArtistKey(variant);
    const gKey = normalizeArtistKey(got);
    if (!wKey || !gKey) continue;

    best = Math.max(best, stringSimilarity(wKey, gKey));

    const wParts = artistNameParts(variant);
    const gParts = artistNameParts(got);
    const wLast = wParts[wParts.length - 1] ?? "";
    const gLast = gParts[gParts.length - 1] ?? "";
    if (wLast.length >= 3 && gLast.length >= 3) {
      best = Math.max(best, stringSimilarity(wLast, gLast));
    }

    if (wParts[0] && gParts[0] && wParts[0]!.length >= 3 && wParts[0] === gParts[0] && wLast && gLast) {
      const lastSim = stringSimilarity(wLast, gLast);
      best = Math.max(best, 0.25 + lastSim * 0.75);
    }
  }
  return Math.min(1, best);
}

function artistTokenOverlap(want: string, got: string): boolean {
  const tokens = artistTokens(want);
  if (tokens.length === 0) return false;
  const gotNorm = normalizeArtistKey(got);
  return tokens.filter((t) => t.length >= 4).some((t) => gotNorm.includes(t));
}

function isAmbiguousShortTitle(titulo: string): boolean {
  return titleWords(titulo).length <= 1;
}

const STOP_WORDS = new Set(["the", "and", "of", "a", "o", "e", "de", "da", "do", "feat"]);

function titleWords(titulo: string): string[] {
  return coreTitleForMatch(titulo)
    .split(/\s+/)
    .map((w) => foldAccents(w))
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function artistMatches(want: string, got: string): boolean {
  if (artistSimilarity(want, got) >= ARTIST_SIM_MATCH_MIN) return true;

  const variants = [
    normalizeSearchArtist(want),
    primaryArtistForMatch(want),
    normalizeSearchArtist(primaryArtistForMatch(want)),
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  for (const variant of variants) {
    const a = normalizeArtistKey(variant);
    const b = normalizeArtistKey(got);
    if (!a || !b) continue;
    if (a === b) return true;
    if (a.length >= 4 && (b.includes(a) || a.includes(b))) return true;
    const aParts = a.split(/\s+/).filter(Boolean);
    const bParts = b.split(/\s+/).filter(Boolean);
    if (aParts[0] && bParts[0] && aParts[0]!.length >= 3 && aParts[0] === bParts[0]) {
      const aLast = aParts[aParts.length - 1];
      const bLast = bParts[bParts.length - 1];
      if (aLast && bLast && aLast.length >= 4 && (bLast.includes(aLast) || aLast.includes(bLast))) {
        return true;
      }
    }
    if (artistTokenOverlap(variant, got)) return true;
  }
  return false;
}

function titleWordMatches(wantWord: string, gotCore: string): boolean {
  if (gotCore.includes(wantWord)) return true;
  if (wantWord.length < 5) return false;
  const gotWords = gotCore.split(/\s+/).filter(Boolean);
  return gotWords.some((gw) => stringSimilarity(wantWord, gw) >= 0.72);
}

function titleMatches(want: string, got: string): { ok: boolean; ratio: number } {
  const wantCore = foldAccents(coreTitleForMatch(want));
  const gotCore = foldAccents(coreTitleForMatch(got));
  if (!wantCore || !gotCore) return { ok: false, ratio: 0 };
  if (wantCore === gotCore) return { ok: true, ratio: 1 };
  if (wantCore.length >= 5 && gotCore.includes(wantCore)) return { ok: true, ratio: 0.92 };
  if (gotCore.length >= 5 && wantCore.includes(gotCore)) return { ok: true, ratio: 0.88 };
  if (stringSimilarity(wantCore, gotCore) >= 0.82) return { ok: true, ratio: 0.9 };

  const words = titleWords(want);
  if (words.length === 0) return { ok: false, ratio: 0 };
  const matched = words.filter((w) => titleWordMatches(w, gotCore));
  const ratio = matched.length / words.length;
  const ok = ratio >= 0.55 && matched.length >= 1;
  return { ok, ratio };
}

export function scoreDeezerHit(input: ParsedArtistTitle, hit: DeezerTrackHit): number {
  const hitTitle = hit.title?.trim() ?? "";
  const hitArtist = hit.artist?.name?.trim() ?? "";
  if (!hitTitle || !hitArtist) return 0;

  const artistSim = artistSimilarity(input.artista, hitArtist);
  if (artistSim < ARTIST_SIM_PICK_MIN) return 0;

  const { ok, ratio } = titleMatches(input.titulo, hitTitle);
  if (!ok) return 0;

  let score = Math.round(ratio * 45 + artistSim * 55);
  const wantCore = foldAccents(coreTitleForMatch(input.titulo));
  const gotCore = foldAccents(coreTitleForMatch(hitTitle));
  if (wantCore === gotCore && artistSim >= 0.85) score = 100;
  else if (wantCore === gotCore && artistSim >= ARTIST_SIM_MATCH_MIN) score = Math.max(score, 96);
  else if (ratio >= 0.9 && artistSim >= ARTIST_SIM_MATCH_MIN) score = Math.max(score, 93);
  else if (artistMatches(input.artista, hitArtist)) score += 3;

  return Math.min(100, score);
}

function hitToCandidate(hit: DeezerTrackHit, score: number): DeezerTrackCandidate | null {
  if (!hit.id) return null;
  const url = `https://www.deezer.com/track/${hit.id}`;
  const durationSec = typeof hit.duration === "number" ? hit.duration : null;
  return {
    trackId: hit.id,
    url,
    title: hit.title?.trim() || "—",
    artist: hit.artist?.name?.trim() || "—",
    score,
    durationSec,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dzFetch(
  path: string,
  attempt = 0,
): Promise<{ data?: DeezerTrackHit[]; status?: number } | null> {
  const maxAttempts = 3;
  try {
    const res = await fetch(`${DZ_BASE}${path}`, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(DZ_FETCH_TIMEOUT_MS),
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt < maxAttempts - 1) {
        await sleep(900 * (attempt + 1));
        return dzFetch(path, attempt + 1);
      }
      return { status: res.status };
    }
    if (!res.ok) return { status: res.status };
    return (await res.json()) as { data?: DeezerTrackHit[] };
  } catch {
    if (attempt < maxAttempts - 1) {
      await sleep(600 * (attempt + 1));
      return dzFetch(path, attempt + 1);
    }
    return null;
  }
}

async function dzFetchSequential(
  paths: string[],
  gapMs = 150,
): Promise<{ results: ({ data?: DeezerTrackHit[] } | null)[]; failures: number }> {
  const results: ({ data?: DeezerTrackHit[] } | null)[] = [];
  let failures = 0;
  for (const path of paths) {
    const r = await dzFetch(path);
    const httpFailed = r == null || r.status != null;
    if (httpFailed) failures += 1;
    results.push(httpFailed ? null : r);
    if (gapMs > 0) await sleep(gapMs);
  }
  return { results, failures };
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

async function searchDeezerTracks(
  input: ParsedArtistTitle,
): Promise<{ hits: DeezerTrackHit[]; failures: number }> {
  const core = coreTitleForMatch(input.titulo);
  const artista = input.artista.trim();
  const artistaPrimary = primaryArtistForMatch(artista);
  const artistaAlt = normalizeSearchArtist(artistaPrimary);
  const artistaPlain = accentStripForSearch(artistaPrimary);
  const words = titleWords(input.titulo);
  const shortQuery = words.slice(0, 5).join(" ");

  // Combo «artista título» primeiro — mesmo comportamento da busca web do Deezer.
  const queries = [
    `${artistaPrimary} ${core}`,
    `${artista} ${core}`,
    artistaPlain !== artistaPrimary ? `${artistaPlain} ${core}` : null,
    shortQuery && shortQuery !== core ? `${artistaPrimary} ${shortQuery}` : null,
    `artist:"${artista}" track:"${core}"`,
    artistaPrimary !== artista ? `artist:"${artistaPrimary}" track:"${core}"` : null,
    artistaAlt !== artistaPrimary ? `${artistaAlt} ${core}` : null,
  ].filter((q): q is string => Boolean(q?.trim()));

  const paths = queries.map((q) => {
    const structured = q.includes('"') || q.includes("track:") || q.includes("artist:");
    return structured
      ? `/search?q=${encodeURIComponent(q)}&limit=10`
      : `/search/track?q=${encodeURIComponent(q)}&limit=10`;
  });
  const { results, failures } = await dzFetchSequential(paths, 120);
  return { hits: mergeDeezerHits(results), failures };
}

type DeezerArtistRow = { id?: number; name?: string };

/**
 * Faixas de compilação/bossa: a busca geral devolve «Banda Do Sul» / «48th St. Collective»,
 * mas o catálogo do artista no Deezer tem a faixa correta (o site web usa ranking diferente).
 */
async function searchDeezerArtistCatalog(
  input: ParsedArtistTitle,
): Promise<{ hits: DeezerTrackHit[]; failures: number }> {
  const artistaPrimary = primaryArtistForMatch(input.artista);
  const artistaPlain = accentStripForSearch(artistaPrimary);
  const artistQueries = [artistaPrimary, input.artista.trim(), artistaPlain].filter(
    (q, i, a) => Boolean(q?.trim()) && a.indexOf(q) === i,
  );

  let failures = 0;
  const seenArtistIds = new Set<number>();
  const artistRows: DeezerArtistRow[] = [];

  for (const q of artistQueries) {
    const r = await dzFetch(`/search/artist?q=${encodeURIComponent(q)}&limit=6`);
    if (r == null || r.status != null) {
      failures += 1;
      continue;
    }
    for (const row of (r.data ?? []) as DeezerArtistRow[]) {
      if (row.id && !seenArtistIds.has(row.id)) {
        seenArtistIds.add(row.id);
        artistRows.push(row);
      }
    }
    await sleep(80);
  }

  const hits: DeezerTrackHit[] = [];
  const seenTrackIds = new Set<number>();

  for (const artist of artistRows.slice(0, 3)) {
    const name = artist.name?.trim() ?? "";
    if (!artist.id || !name) continue;
    if (artistSimilarity(input.artista, name) < ARTIST_SIM_PICK_MIN) continue;

    const top = await dzFetch(`/artist/${artist.id}/top?limit=100`);
    if (top == null || top.status != null) {
      failures += 1;
      continue;
    }
    for (const track of top.data ?? []) {
      if (!track.id || seenTrackIds.has(track.id)) continue;
      seenTrackIds.add(track.id);
      hits.push({
        id: track.id,
        link: track.link,
        title: track.title,
        duration: track.duration,
        artist: { name },
      });
    }
    await sleep(80);
  }

  return { hits, failures };
}

const MIN_HITS_BEFORE_EXTRA_SEARCH = 4;

/** Busca Deezer em camadas — combo artista+título, título, fallback. */
async function collectDeezerSearchHits(
  parsed: ParsedArtistTitle,
  searchArtist?: string,
): Promise<{ hits: DeezerTrackHit[]; failures: number }> {
  const forSearch =
    searchArtist?.trim() ? { ...parsed, artista: searchArtist.trim() } : parsed;
  const core = coreTitleForMatch(parsed.titulo);
  const artistaPrimary = primaryArtistForMatch(forSearch.artista);
  const artistaPlain = accentStripForSearch(artistaPrimary);

  let failures = 0;

  // Catálogo do artista primeiro — compilações/bossa não aparecem na busca geral da API.
  const catalog = await searchDeezerArtistCatalog(forSearch);
  failures += catalog.failures;
  let hits = catalog.hits;

  const artistSearch = await searchDeezerTracks(forSearch);
  failures += artistSearch.failures;
  hits = mergeDeezerHits([{ data: hits }, { data: artistSearch.hits }]);

  const needMore = () => hits.length < MIN_HITS_BEFORE_EXTRA_SEARCH;

  if (needMore()) {
    const titleSearch = await searchDeezerByTitle(parsed);
    failures += titleSearch.failures;
    hits = mergeDeezerHits([{ data: hits }, { data: titleSearch.hits }]);
  }

  if (needMore()) {
    const comboQueries = [
      `${artistaPrimary} ${core}`,
      artistaPlain !== artistaPrimary ? `${artistaPlain} ${core}` : null,
    ].filter((q): q is string => Boolean(q?.trim()));
    for (const combo of comboQueries) {
      const comboSearch = await dzFetch(`/search/track?q=${encodeURIComponent(combo)}&limit=15`);
      if (comboSearch == null || comboSearch.status != null) failures += 1;
      hits = mergeDeezerHits([{ data: hits }, comboSearch?.status == null ? comboSearch : null]);
      if (!needMore()) break;
    }
  }

  if (needMore()) {
    const coreSearch = await dzFetch(`/search/track?q=${encodeURIComponent(core)}&limit=15`);
    if (coreSearch == null || coreSearch.status != null) failures += 1;
    hits = mergeDeezerHits([{ data: hits }, coreSearch?.status == null ? coreSearch : null]);
  }

  return { hits, failures };
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

async function searchDeezerByTitle(
  input: ParsedArtistTitle,
): Promise<{ hits: DeezerTrackHit[]; failures: number }> {
  const core = coreTitleForMatch(input.titulo);
  const versionHint = versionHintFromTitle(input.titulo);
  const words = titleWords(input.titulo);
  const shortQuery = words.slice(0, 6).join(" ");

  const queries = [
    versionHint ? `${core} ${versionHint}` : null,
    shortQuery || core,
  ].filter((q): q is string => Boolean(q?.trim()));

  const paths = queries.map((q) => `/search/track?q=${encodeURIComponent(q)}&limit=12`);
  const { results, failures } = await dzFetchSequential(paths, 120);
  return { hits: mergeDeezerHits(results), failures };
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

    const artistSim = artistSimilarity(input.artista, hitArtist);
    if (artistSim < ARTIST_SIM_PICK_MIN) continue;

    const { ok, ratio } = titleMatches(input.titulo, hitTitle);
    if (!ok) continue;

    const versionRatio = versionWordsMatchRatio(input.titulo, hitTitle);
    if (versionWords(input.titulo).length > 0 && versionRatio < 0.5) continue;

    let score = Math.round(ratio * 40 + artistSim * 45 + versionRatio * 15);
    if (isAmbiguousShortTitle(input.titulo) && artistSim < ARTIST_SIM_MATCH_MIN) continue;
    if (score < CANDIDATE_MIN_SCORE) continue;

    const c = hitToCandidate(hit, Math.min(98, score));
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

function mergeRankedCandidates(...lists: DeezerTrackCandidate[][]): DeezerTrackCandidate[] {
  const byId = new Map<number, DeezerTrackCandidate>();
  for (const list of lists) {
    for (const c of list) {
      const prev = byId.get(c.trackId);
      if (!prev || c.score > prev.score) byId.set(c.trackId, c);
    }
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
}

const LEGACY_CANDIDATE_MIN_SCORE = 32;

/** Título Deezer indica versão alternativa (live, remix…) — legado costuma ser estúdio. */
export function isAlternateVersionTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  if (/\((?:[^)]*(?:ao vivo|live|remix|acoustic|acústic|acustic|edit|radio edit|ver\.|version|mix|tiësto|tiesto|mike mago|remaster|unplugged|session|concert|festival|tour)[^)]*)\)/i.test(t)) {
    return true;
  }
  return /\s-\s*(?:live|remix|acoustic|acústic|edit|version|unplugged)\b/i.test(t);
}

/** Artistas típicos de cover/tribute/instrumental genérico — não usar se o legado pediu o artista original. */
export function isLikelyTributeOrCoverArtist(artistName: string): boolean {
  const raw = artistName.trim();
  if (!raw) return true;
  if (/^the sound of\b/i.test(raw)) return true;
  if (/\b(studio group|zoom entertainment|white knight|vital fire|in the style of|tribute to|karaoke|as made famous|cover version|performed by|instrumental\b)/i.test(raw)) {
    return true;
  }
  const key = foldAccents(raw);
  if (/\bcover\b/.test(key) && !/\bcover\s*me\b/.test(key)) return true;
  return false;
}

function scoreLegacyHit(parsed: ParsedArtistTitle, hit: DeezerTrackHit): number {
  const hitTitle = hit.title?.trim() ?? "";
  const hitArtist = hit.artist?.name?.trim() ?? "";
  if (hitArtist && isLikelyTributeOrCoverArtist(hitArtist)) return 0;

  const base = scoreDeezerHit(parsed, hit);
  if (base >= CANDIDATE_MIN_SCORE) return base;
  if (!hitTitle || !hitArtist) return 0;
  const artistSim = artistSimilarity(parsed.artista, hitArtist);
  if (artistSim < ARTIST_SIM_PICK_MIN) return 0;
  const { ok, ratio } = titleMatches(parsed.titulo, hitTitle);
  if (!ok || ratio < 0.55) return 0;
  return Math.min(88, Math.round(ratio * 42 + artistSim * 40 + 8));
}

/**
 * Busca expandida para migração legado — sempre devolve vários candidatos com duração.
 * Não faz auto-pick único (evita escolher «Ao Vivo» quando o legado é estúdio).
 */
export async function resolveDeezerLegacyCandidates(
  line: string,
  opts?: { strictPrimaryArtist?: boolean },
): Promise<{
  parsed: ParsedArtistTitle;
  candidates: DeezerTrackCandidate[];
  apiFailures: number;
}> {
  const strictArtist = opts?.strictPrimaryArtist === true;
  const normalized = normalizeLegacyFilenameForSearch(line);
  const parsed = parseArtistTitleFromLine(normalized);
  if (!parsed) {
    throw new Error("Formato inválido — use «Artista - Música».");
  }

  const searchArtist =
    strictArtist ? primaryLegacyArtist(parsed.artista) || parsed.artista : undefined;
  const { hits, failures: apiFailures } = await collectDeezerSearchHits(parsed, searchArtist);

  const byId = new Map<number, DeezerTrackCandidate>();
  const legacyWantsAlt = isAlternateVersionTitle(parsed.titulo);
  for (const hit of hits) {
    const hitArtist = hit.artist?.name?.trim() ?? "";
    if (strictArtist && hitArtist && !strictPrimaryArtistMatch(parsed.artista, hitArtist)) continue;

    const score = scoreLegacyHit(parsed, hit);
    if (score < LEGACY_CANDIDATE_MIN_SCORE) continue;
    const c = hitToCandidate(hit, score);
    if (!c) continue;
    if (isLikelyTributeOrCoverArtist(c.artist)) continue;
    if (!legacyWantsAlt && isAlternateVersionTitle(c.title)) continue;
    if (strictArtist) {
      if (!strictPrimaryArtistMatch(parsed.artista, c.artist)) continue;
    } else if (artistSimilarity(parsed.artista, c.artist) < ARTIST_SIM_PICK_MIN) {
      continue;
    }
    const prev = byId.get(c.trackId);
    if (!prev || c.score > prev.score) byId.set(c.trackId, c);
  }

  const candidates = [...byId.values()].sort((a, b) => b.score - a.score).slice(0, 10);
  return { parsed, candidates, apiFailures };
}

/** Resolve texto ou devolve candidatos para escolha manual. */
export async function resolveDeezerTrackFromText(line: string): Promise<DeezerTrackResolveResult> {
  const normalized = normalizeLegacyFilenameForSearch(line);
  const parsed = parseArtistTitleFromLine(normalized);
  if (!parsed) {
    throw new Error(
      "Use o formato «Artista - Música» (primeiro hífen separa artista) ou cole link deezer.com/track/…",
    );
  }

  const { hits, failures: apiFailures } = await collectDeezerSearchHits(parsed);
  let candidates = rankArtistCandidates(parsed, hits);
  if (!isAmbiguousShortTitle(parsed.titulo)) {
    candidates = mergeRankedCandidates(candidates, rankTitleFallbackCandidates(parsed, hits));
  }

  candidates = candidates.slice(0, 6);

  if (candidates[0] && candidates[0].score >= AUTO_PICK_MIN_SCORE) {
    return { status: "resolved", url: candidates[0].url, candidate: candidates[0] };
  }

  if (candidates.length > 0) {
    return { status: "pick", parsed, candidates };
  }

  if (apiFailures >= 2) {
    throw new Error(
      "Busca Deezer falhou (limite de requisições ou timeout). Aguarde ~1 min e tente de novo — a faixa pode existir no Deezer.",
    );
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
