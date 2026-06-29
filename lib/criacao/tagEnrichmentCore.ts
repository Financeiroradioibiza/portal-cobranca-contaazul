import type { Prisma } from "@prisma/client";

/** Tag automática externa — mesmo formato gravado em musica_biblioteca.tags_auto */
export type ExternalAutoTag = { fonte: string; chave?: string; valor: string };

export function parseTagsFromJson(raw: Prisma.JsonValue | null): ExternalAutoTag[] {
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

function scoreDeezerHit(input: { titulo: string; artista: string }, hit: DeezerTrackHit): number {
  const hitTitle = hit.title?.trim() ?? "";
  const hitArtist = hit.artist?.name?.trim() ?? "";
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
      ? `/search?q=${encodeURIComponent(q)}&limit=5`
      : `/search/track?q=${encodeURIComponent(q)}&limit=5`;
    const search = (await dzFetch(path)) as { data?: DeezerTrackHit[] } | null;
    for (const t of search?.data ?? []) {
      if (t.id && !seen.has(t.id)) {
        seen.add(t.id);
        hits.push(t);
      }
    }
    if (hits.length > 0) break;
  }
  return hits;
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
  return bestScore >= 85 ? best : undefined;
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

async function fetchDeezerLabel(input: { titulo: string; artista: string }): Promise<string | null> {
  if (!isEligibleForExternalTrackMatch(input)) return null;
  const hits = await searchDeezerTracks(input);
  const hit = pickDeezerTrackHit(input, hits);
  const albumId = hit?.album?.id;
  if (!albumId) return null;
  const album = (await dzFetch(`/album/${albumId}`)) as { label?: string } | null;
  const label = album?.label?.trim();
  return label ? label.slice(0, 120) : null;
}

/** Deezer: campo `explicit_lyrics` na faixa encontrada. null = não achou match. */
export async function fetchDeezerExplicit(input: {
  titulo: string;
  artista: string;
}): Promise<boolean | null> {
  if (!isEligibleForExternalTrackMatch(input)) return null;
  const hits = await searchDeezerTracks(input);
  const hit = pickDeezerTrackHit(input, hits);
  if (!hit?.id) return null;
  if (typeof hit.explicit_lyrics === "boolean") return hit.explicit_lyrics;
  const track = (await dzFetch(`/track/${hit.id}`)) as { explicit_lyrics?: boolean } | null;
  if (track && typeof track.explicit_lyrics === "boolean") return track.explicit_lyrics;
  return null;
}

/** MusicBrainz: tag comunitária `explicit` na gravação. null = gravação não encontrada. */
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

export type ExplicitApiResult = {
  deezer: boolean | null;
  musicbrainz: boolean | null;
};

/** Consulta Deezer + MusicBrainz (mesmas APIs das gravadoras). */
export async function fetchExplicitFromApis(input: {
  titulo: string;
  artista: string;
  isrc: string | null;
}): Promise<ExplicitApiResult> {
  const deezer = await fetchDeezerExplicit(input);
  const musicbrainz = await fetchMusicBrainzExplicit(input);
  return { deezer, musicbrainz };
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

/** Busca gravadora em MusicBrainz (prioridade) e Deezer (fallback). */
export async function fetchLabelTags(input: {
  titulo: string;
  artista: string;
  isrc: string | null;
}): Promise<ExternalAutoTag[]> {
  const out: ExternalAutoTag[] = [];
  const mb = await fetchMusicBrainzLabel(input);
  if (mb) out.push({ fonte: "musicbrainz", chave: "label", valor: mb });
  if (!mb) {
    const dz = await fetchDeezerLabel(input);
    if (dz) out.push({ fonte: "deezer", chave: "label", valor: dz });
  }
  return out;
}

/** Nomes canônicos artista/título como no Deezer (streaming). */
export async function fetchDeezerCanonicalNames(input: {
  titulo: string;
  artista: string;
}): Promise<{ titulo: string; artista: string } | null> {
  if (!isEligibleForExternalTrackMatch(input)) return null;
  const hits = await searchDeezerTracks(input);
  const hit = pickDeezerTrackHit(input, hits);
  if (!hit || scoreDeezerHit(input, hit) < 100) return null;
  const titulo = hit.title?.trim();
  const artista = hit.artist?.name?.trim();
  if (!titulo || !artista) return null;
  return { titulo: titulo.slice(0, 500), artista: artista.slice(0, 500) };
}
