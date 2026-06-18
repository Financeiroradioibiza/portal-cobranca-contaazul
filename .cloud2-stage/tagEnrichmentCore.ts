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

  if (!releaseId && input.titulo.trim() && input.artista.trim()) {
    const q = `recording:"${input.titulo.trim()}" AND artist:"${input.artista.trim()}"`;
    const search = (await mbFetch(
      `/recording?query=${encodeURIComponent(q)}&fmt=json&limit=3`,
    )) as { recordings?: { releases?: { id?: string }[] }[] } | null;
    for (const rec of search?.recordings ?? []) {
      const rel = rec.releases?.[0]?.id;
      if (rel) {
        releaseId = rel;
        break;
      }
    }
  }

  if (!releaseId) return null;

  const release = await mbFetch(`/release/${releaseId}?fmt=json&inc=labels`);
  return pickMbLabel(release);
}

async function fetchDeezerLabel(input: { titulo: string; artista: string }): Promise<string | null> {
  if (!input.titulo.trim() || !input.artista.trim()) return null;
  const q = `artist:"${input.artista.trim()}" track:"${input.titulo.trim()}"`;
  const search = (await dzFetch(`/search?q=${encodeURIComponent(q)}&limit=3`)) as {
    data?: { album?: { id?: number }; title?: string; artist?: { name?: string } }[];
  } | null;
  const hit =
    search?.data?.find(
      (t) =>
        t.title?.toLowerCase().includes(input.titulo.trim().toLowerCase().slice(0, 8)) ||
        t.artist?.name?.toLowerCase().includes(input.artista.trim().toLowerCase().slice(0, 6)),
    ) ?? search?.data?.[0];
  const albumId = hit?.album?.id;
  if (!albumId) return null;
  const album = (await dzFetch(`/album/${albumId}`)) as { label?: string } | null;
  const label = album?.label?.trim();
  return label ? label.slice(0, 120) : null;
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
