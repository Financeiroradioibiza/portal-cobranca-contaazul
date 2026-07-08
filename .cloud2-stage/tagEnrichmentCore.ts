/** Tag automática externa — mesmo formato gravado em musica_biblioteca.tags_auto */
export type ExternalAutoTag = { fonte: string; chave?: string; valor: string };

export function parseTagsFromJson(raw: unknown): ExternalAutoTag[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => {
      if (t && typeof t === "object" && !Array.isArray(t)) {
        const o = t as Record<string, unknown>;
        const valor = o.valor != null ? String(o.valor) : "";
        if (!valor) return null;
        return {
          fonte: o.fonte != null ? String(o.fonte) : "local",
          chave: o.chave != null ? String(o.chave) : undefined,
          valor,
        } as ExternalAutoTag;
      }
      return null;
    })
    .filter((t): t is ExternalAutoTag => t !== null);
}

const MB_BASE = "https://musicbrainz.org/ws/2";
const DZ_BASE = "https://api.deezer.com";
const UA = "RadioIbizaPortal/1.0 (criacao-musical; contact@radioibiza.com.br)";

let lastMbAt = 0;

async function throttleMusicBrainz(): Promise<void> {
  const wait = Math.max(0, 1100 - (Date.now() - lastMbAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastMbAt = Date.now();
}

async function mbFetch(path: string): Promise<unknown | null> {
  await throttleMusicBrainz();
  try {
    const res = await fetch(`${MB_BASE}${path}`, {
      headers: { Accept: "application/json", "User-Agent": UA },
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

async function dzFetch(path: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${DZ_BASE}${path}`, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/** Limpa sufixos comuns de upload (feat, vídeo, mix) para busca externa. */
export function normalizeSearchTitle(titulo: string): string {
  return titulo
    .replace(/\s*\((?:part\.|part|feat\.|feat|ft\.|ft|featuring)[^)]*\)/gi, "")
    .replace(/\s*\([^)]*(?:official|video|audio|lyric|visualizer|mv|hd|4k|live)[^)]*\)/gi, "")
    .replace(/\s*\([^)]*(?:mix|remaster|remix|edit|version|ver\.|radio)[^)]*\)/gi, "")
    .replace(/\s*[-–—]\s*(?:official\s+)?(?:music\s+)?video.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchArtist(artista: string): string {
  const trimmed = artista.trim();
  const alt = trimmed.replace(/^the\s+/i, "").trim();
  return alt || trimmed;
}

function foldAccents(input: string): string {
  return input.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function foldTitleForMatch(titulo: string): string {
  return foldAccents(normalizeSearchTitle(titulo))
    .replace(/[.'']/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
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
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

function normalizeArtistKey(artista: string): string {
  return foldAccents(normalizeSearchArtist(artista))
    .replace(/\./g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 0–1 — typo leve no sobrenome (Sabib ≈ Sarbib). */
export function artistSimilarity(want: string, got: string): number {
  const variants = [want, normalizeSearchArtist(want)].filter((v, i, a) => v.trim() && a.indexOf(v) === i);
  let best = 0;
  for (const variant of variants) {
    const wKey = normalizeArtistKey(variant);
    const gKey = normalizeArtistKey(got);
    if (!wKey || !gKey) continue;
    best = Math.max(best, stringSimilarity(wKey, gKey));
    const wParts = wKey.split(/\s+/).filter(Boolean);
    const gParts = gKey.split(/\s+/).filter(Boolean);
    const wLast = wParts[wParts.length - 1] ?? "";
    const gLast = gParts[gParts.length - 1] ?? "";
    if (wLast.length >= 3 && gLast.length >= 3) best = Math.max(best, stringSimilarity(wLast, gLast));
    if (wParts[0] && gParts[0] && wParts[0] === gParts[0] && wLast && gLast) {
      best = Math.max(best, 0.25 + stringSimilarity(wLast, gLast) * 0.75);
    }
  }
  return Math.min(1, best);
}

const ARTIST_SIM_PICK_MIN = 0.42;
const DEEZER_HIT_MIN_SCORE = 48;

/** Evita busca externa com nomes genéricos de upload (ex.: Pop.mp3, Satisfy.mp3). */
export function isEligibleForExternalTrackMatch(input: { titulo: string; artista: string }): boolean {
  const titulo = normalizeSearchTitle(input.titulo).trim();
  const artista = input.artista.trim();
  if (titulo.length < 4 || artista.length < 2) return false;
  const lower = titulo.toLowerCase();
  if (/^(pop|jazz|rock|mix|demo|faixa|track|satisfy|interlude|audio|music)(\d|[.\s_(-]|$)/i.test(lower)) {
    return false;
  }
  return true;
}

function titleMatchRatio(want: string, got: string): number {
  const w = foldTitleForMatch(want);
  const g = foldTitleForMatch(got);
  if (!w || !g) return 0;
  if (w === g) return 1;
  if (w.length >= 5 && g.includes(w)) return 0.92;
  if (g.length >= 5 && w.includes(g)) return 0.88;
  const words = w.split(/\s+/).filter((x) => x.length > 2);
  if (words.length === 0) return 0;
  return words.filter((x) => g.includes(x)).length / words.length;
}

function scoreDeezerHit(input: { titulo: string; artista: string }, hit: DeezerTrackHit): number {
  const hitTitle = hit.title?.trim() ?? "";
  const hitArtist = hit.artist?.name?.trim() ?? "";
  if (!hitTitle || !hitArtist) return 0;
  const titleRatio = titleMatchRatio(input.titulo, hitTitle);
  if (titleRatio < 0.55) return 0;
  const artistSim = artistSimilarity(input.artista, hitArtist);
  if (artistSim < ARTIST_SIM_PICK_MIN) return 0;
  return Math.round(titleRatio * 45 + artistSim * 55);
}

type DeezerTrackHit = {
  id?: number;
  album?: { id?: number };
  title?: string;
  artist?: { name?: string };
  explicit_lyrics?: boolean;
};

async function searchDeezerTracks(input: { titulo: string; artista: string }): Promise<DeezerTrackHit[]> {
  const titulo = normalizeSearchTitle(input.titulo);
  const artista = input.artista.trim();
  if (!artista || !isEligibleForExternalTrackMatch(input)) return [];
  const artistaAlt = normalizeSearchArtist(artista);
  const queries = [
    `artist:"${artista}" track:"${titulo}"`,
    titulo !== input.titulo.trim() ? `artist:"${artista}" track:"${input.titulo.trim()}"` : null,
    `${artista} ${titulo}`,
    artistaAlt !== artista ? `${artistaAlt} ${titulo}` : null,
  ].filter((q): q is string => Boolean(q));

  const seen = new Set<number>();
  const hits: DeezerTrackHit[] = [];

  for (const q of queries) {
    const structured = q.includes('"') || q.includes("track:") || q.includes("artist:");
    const path = structured
      ? `/search?q=${encodeURIComponent(q)}&limit=8`
      : `/search/track?q=${encodeURIComponent(q)}&limit=8`;
    const search = (await dzFetch(path)) as { data?: DeezerTrackHit[] } | null;
    for (const t of search?.data ?? []) {
      if (t.id && !seen.has(t.id)) {
        seen.add(t.id);
        hits.push(t);
      }
    }
  }
  return hits;
}

async function searchDeezerByTitle(input: { titulo: string; artista: string }): Promise<DeezerTrackHit[]> {
  const core = foldTitleForMatch(input.titulo);
  const words = core.split(/\s+/).filter((w) => w.length > 2).slice(0, 6).join(" ");
  const queries = [core, words].filter((q, i, a) => Boolean(q?.trim()) && a.indexOf(q) === i);
  const seen = new Set<number>();
  const hits: DeezerTrackHit[] = [];
  for (const q of queries) {
    const search = (await dzFetch(`/search/track?q=${encodeURIComponent(q)}&limit=12`)) as {
      data?: DeezerTrackHit[];
    } | null;
    for (const t of search?.data ?? []) {
      if (t.id && !seen.has(t.id)) {
        seen.add(t.id);
        hits.push(t);
      }
    }
  }
  return hits;
}

function pickDeezerTrackHit(input: { titulo: string; artista: string }, hits: DeezerTrackHit[]) {
  if (!isEligibleForExternalTrackMatch(input)) return undefined;
  let best: DeezerTrackHit | undefined;
  let bestScore = 0;
  for (const hit of hits) {
    const score = scoreDeezerHit(input, hit);
    if (score > bestScore) {
      bestScore = score;
      best = hit;
    }
  }
  return bestScore >= DEEZER_HIT_MIN_SCORE ? best : undefined;
}

async function findBestDeezerTrack(input: { titulo: string; artista: string }): Promise<DeezerTrackHit | undefined> {
  if (!isEligibleForExternalTrackMatch(input)) return undefined;
  const seen = new Set<number>();
  const merged: DeezerTrackHit[] = [];
  for (const t of [...(await searchDeezerTracks(input)), ...(await searchDeezerByTitle(input))]) {
    if (t.id && !seen.has(t.id)) {
      seen.add(t.id);
      merged.push(t);
    }
  }
  return pickDeezerTrackHit(input, merged);
}

function pickMbLabel(release: unknown): string | null {
  if (!release || typeof release !== "object") return null;
  const infos = (release as { "label-info"?: unknown[] })["label-info"];
  if (!Array.isArray(infos)) return null;
  for (const info of infos) {
    if (!info || typeof info !== "object") continue;
    const label = (info as { label?: { name?: string } }).label;
    const name = label?.name?.trim();
    if (name) return name.slice(0, 120);
  }
  return null;
}

async function fetchMusicBrainzLabel(input: {
  titulo: string;
  artista: string;
  isrc: string | null;
}): Promise<string | null> {
  let releaseId: string | null = null;

  if (input.isrc?.trim()) {
    const isrcData = (await mbFetch(
      `/isrc/${encodeURIComponent(input.isrc.trim())}?fmt=json&inc=recordings`,
    )) as { recordings?: { releases?: { id?: string }[] }[] } | null;
    const recs = isrcData?.recordings ?? [];
    for (const rec of recs) {
      const rel = rec.releases?.[0]?.id;
      if (rel) {
        releaseId = rel;
        break;
      }
    }
  }

  if (!releaseId) {
    const recordingId = await resolveMusicBrainzRecordingId(input);
    if (recordingId) {
      const rec = (await mbFetch(
        `/recording/${recordingId}?fmt=json&inc=releases`,
      )) as { releases?: { id?: string }[] } | null;
      releaseId = rec?.releases?.[0]?.id ?? null;
    }
  }

  if (!releaseId) return null;

  const release = await mbFetch(`/release/${releaseId}?fmt=json&inc=labels`);
  return pickMbLabel(release);
}

async function resolveMusicBrainzRecordingId(input: {
  titulo: string;
  artista: string;
  isrc: string | null;
}): Promise<string | null> {
  if (input.isrc?.trim()) {
    const isrcData = (await mbFetch(
      `/isrc/${encodeURIComponent(input.isrc.trim())}?fmt=json&inc=recordings`,
    )) as { recordings?: { id?: string }[] } | null;
    const id = isrcData?.recordings?.[0]?.id;
    if (id) return id;
  }

  if (!input.titulo.trim() || !input.artista.trim()) return null;

  const titulo = normalizeSearchTitle(input.titulo);
  const artista = input.artista.trim();
  const queries = [
    `recording:"${titulo}" AND artist:"${artista}"`,
    titulo !== input.titulo.trim() ? `recording:"${input.titulo.trim()}" AND artist:"${artista}"` : null,
    `recording:"${titulo}" AND artist:"${normalizeSearchArtist(artista)}"`,
  ].filter((q): q is string => Boolean(q));

  for (const q of queries) {
    const search = (await mbFetch(
      `/recording?query=${encodeURIComponent(q)}&fmt=json&limit=3`,
    )) as { recordings?: { id?: string }[] } | null;
    const id = search?.recordings?.[0]?.id;
    if (id) return id;
  }
  return null;
}

async function fetchDeezerLabel(input: { titulo: string; artista: string }): Promise<string | null> {
  if (!isEligibleForExternalTrackMatch(input)) return null;
  const hit = await findBestDeezerTrack(input);
  const albumId = hit?.album?.id;
  if (!albumId) return null;
  const album = (await dzFetch(`/album/${albumId}`)) as { label?: string } | null;
  const label = album?.label?.trim();
  return label ? label.slice(0, 120) : null;
}

export async function fetchDeezerExplicit(input: {
  titulo: string;
  artista: string;
}): Promise<boolean | null> {
  if (!isEligibleForExternalTrackMatch(input)) return null;
  const hit = await findBestDeezerTrack(input);
  if (!hit?.id) return null;
  if (typeof hit.explicit_lyrics === "boolean") return hit.explicit_lyrics;
  const track = (await dzFetch(`/track/${hit.id}`)) as { explicit_lyrics?: boolean } | null;
  if (track && typeof track.explicit_lyrics === "boolean") return track.explicit_lyrics;
  return null;
}

export async function fetchMusicBrainzExplicit(input: {
  titulo: string;
  artista: string;
  isrc: string | null;
}): Promise<boolean | null> {
  const recordingId = await resolveMusicBrainzRecordingId(input);
  if (!recordingId) return null;
  const rec = (await mbFetch(`/recording/${recordingId}?fmt=json&inc=tags`)) as {
    tags?: { name?: string; count?: number }[];
  } | null;
  const tags = rec?.tags ?? [];
  const hit = tags.find((t) => t.name?.trim().toLowerCase() === "explicit");
  if (!hit) return false;
  return (hit.count ?? 0) > 0;
}

export function mergeApiExplicitTags(
  existing: ExternalAutoTag[],
  input: { deezer: boolean | null; musicbrainz: boolean | null },
): ExternalAutoTag[] {
  const rest = existing.filter(
    (t) => !((t.fonte === "deezer" || t.fonte === "musicbrainz") && t.chave === "explicit"),
  );
  const dz =
    input.deezer === null ? "desconhecida"
    : input.deezer ? "sim"
    : "nao";
  const mb =
    input.musicbrainz === null ? "desconhecida"
    : input.musicbrainz ? "sim"
    : "nao";
  rest.push({ fonte: "deezer", chave: "explicit", valor: dz });
  rest.push({ fonte: "musicbrainz", chave: "explicit", valor: mb });
  return rest;
}

export function hasApiExplicitCheck(tags: ExternalAutoTag[]): boolean {
  const definitive = (fonte: string) => {
    const hit = tags.find((t) => t.fonte === fonte && t.chave === "explicit");
    return hit != null && hit.valor !== "desconhecida";
  };
  return definitive("deezer") && definitive("musicbrainz");
}

export function mergeExternalTags(
  existing: ExternalAutoTag[],
  additions: ExternalAutoTag[],
): ExternalAutoTag[] {
  const stripLabel = (t: ExternalAutoTag) => {
    const k = (t.chave ?? "").toLowerCase();
    return k === "label" || k === "gravadora";
  };
  const base = existing.filter((t) => !stripLabel(t));
  const map = new Map<string, ExternalAutoTag>();
  for (const t of base) map.set(`${t.fonte}|${t.chave ?? ""}|${t.valor}`, t);
  for (const t of additions) {
    if (stripLabel(t)) map.set(`${t.fonte}|label|${t.valor}`, { ...t, chave: "label" });
    else map.set(`${t.fonte}|${t.chave ?? ""}|${t.valor}`, t);
  }
  return [...map.values()];
}

export function extractGravadoraFromTags(tags: ExternalAutoTag[]): string {
  const hit = tags.find((t) => {
    const k = (t.chave ?? "").toLowerCase();
    return k.includes("label") || k.includes("gravadora");
  });
  return hit?.valor ?? "";
}

function normalizeIsrc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/-/g, "").toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(s)) return null;
  return s;
}

export type ExternalTrackMetadata = {
  bpm: number | null;
  isrc: string | null;
  ano: number | null;
  tags: ExternalAutoTag[];
};

async function fetchDeezerTrackMetadata(input: {
  titulo: string;
  artista: string;
}): Promise<ExternalTrackMetadata> {
  const hit = await findBestDeezerTrack(input);
  if (!hit?.id) return { bpm: null, isrc: null, ano: null, tags: [] };

  const full = (await dzFetch(`/track/${hit.id}`)) as {
    bpm?: number;
    isrc?: string;
    release_date?: string;
    album?: { title?: string };
  } | null;

  const tags: ExternalAutoTag[] = [];
  let bpm: number | null = null;
  let isrc: string | null = null;
  let ano: number | null = null;

  if (full) {
    if (full.bpm && Number(full.bpm) > 0) {
      bpm = Math.round(Number(full.bpm));
      tags.push({ fonte: "deezer", chave: "bpm", valor: String(bpm) });
    }
    isrc = normalizeIsrc(full.isrc);
    if (full.release_date) {
      const y = Number(String(full.release_date).slice(0, 4));
      if (y) {
        ano = y;
        tags.push({ fonte: "deezer", chave: "ano", valor: String(y) });
      }
    }
    if (full.album?.title) {
      tags.push({ fonte: "deezer", chave: "album", valor: String(full.album.title).slice(0, 120) });
    }
  }

  return { bpm, isrc, ano, tags };
}

async function fetchMusicBrainzTrackMetadata(input: {
  titulo: string;
  artista: string;
  isrc: string | null;
}): Promise<ExternalTrackMetadata> {
  const tags: ExternalAutoTag[] = [];
  let isrc = normalizeIsrc(input.isrc);
  let ano: number | null = null;

  const recordingId = await resolveMusicBrainzRecordingId({ ...input, isrc });
  if (!recordingId) return { bpm: null, isrc, ano, tags };

  const rec = (await mbFetch(`/recording/${recordingId}?fmt=json&inc=isrcs+releases`)) as {
    isrcs?: string[];
    releases?: { date?: string; country?: string }[];
  } | null;

  if (!isrc && rec?.isrcs?.[0]) isrc = normalizeIsrc(rec.isrcs[0]);

  const rel = rec?.releases?.[0];
  if (rel?.date) {
    const y = Number(String(rel.date).slice(0, 4));
    if (y) {
      ano = y;
      tags.push({ fonte: "musicbrainz", chave: "ano", valor: String(y) });
    }
  }
  if (rel?.country) {
    tags.push({ fonte: "musicbrainz", chave: "pais", valor: String(rel.country).slice(0, 8) });
  }

  return { bpm: null, isrc, ano, tags };
}

/** Deezer (BPM/ISRC) + MusicBrainz (ISRC/ano) — best-effort, sem chave de API. */
export async function fetchExternalTrackMetadata(input: {
  titulo: string;
  artista: string;
  isrc: string | null;
}): Promise<ExternalTrackMetadata> {
  if (!isEligibleForExternalTrackMatch(input)) {
    const isrc = normalizeIsrc(input.isrc);
    const tags: ExternalAutoTag[] = [];
    if (isrc) tags.push({ fonte: "interno", chave: "isrc", valor: isrc });
    const mb = isrc
      ? await fetchMusicBrainzTrackMetadata({ titulo: input.titulo, artista: input.artista, isrc })
      : { bpm: null, isrc, ano: null, tags: [] as ExternalAutoTag[] };
    return {
      bpm: null,
      isrc: mb.isrc ?? isrc,
      ano: mb.ano,
      tags: mergeExternalTags(tags, mb.tags),
    };
  }

  const dz = await fetchDeezerTrackMetadata(input);
  const needMb = !dz.isrc || !dz.ano;
  const mb = needMb
    ? await fetchMusicBrainzTrackMetadata({
        titulo: input.titulo,
        artista: input.artista,
        isrc: dz.isrc ?? input.isrc,
      })
    : { bpm: null, isrc: dz.isrc, ano: dz.ano, tags: [] as ExternalAutoTag[] };

  const isrc = dz.isrc ?? mb.isrc ?? normalizeIsrc(input.isrc);
  const tags = mergeExternalTags(dz.tags, mb.tags);
  if (isrc) {
    tags.push({
      fonte: normalizeIsrc(input.isrc) ? "interno" : dz.isrc ? "deezer" : "musicbrainz",
      chave: "isrc",
      valor: isrc,
    });
  }

  return {
    bpm: dz.bpm,
    isrc,
    ano: dz.ano ?? mb.ano,
    tags,
  };
}

/** Busca gravadora em MusicBrainz (prioridade) e Deezer (fallback). */
export async function fetchLabelTags(input: {
  titulo: string;
  artista: string;
  isrc: string | null;
}): Promise<ExternalAutoTag[]> {
  const out: ExternalAutoTag[] = [];
  const dz = await fetchDeezerLabel(input);
  if (dz) out.push({ fonte: "deezer", chave: "label", valor: dz });
  else {
    const mb = await fetchMusicBrainzLabel(input);
    if (mb) out.push({ fonte: "musicbrainz", chave: "label", valor: mb });
  }
  return out;
}

/** Nomes canônicos artista/título como no Deezer (streaming). */
export async function fetchDeezerCanonicalNames(input: {
  titulo: string;
  artista: string;
}): Promise<{ titulo: string; artista: string } | null> {
  if (!isEligibleForExternalTrackMatch(input)) return null;
  const hit = await findBestDeezerTrack(input);
  if (!hit || scoreDeezerHit(input, hit) < 85) return null;
  const titulo = hit.title?.trim();
  const artista = hit.artist?.name?.trim();
  if (!titulo || !artista) return null;
  return { titulo: titulo.slice(0, 500), artista: artista.slice(0, 500) };
}
