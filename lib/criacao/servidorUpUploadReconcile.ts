import type { ServidorUpUploadTrackInput } from "@/lib/criacao/servidorUpUploadService";

export function deezerTrackIdFromUrl(url: string): string | null {
  const m = url.trim().match(/deezer\.com\/(?:\w+\/)?track\/(\d+)/i);
  return m?.[1] ?? null;
}

export type DownloadItemForMatch = {
  id: string;
  linhaOriginal: string;
  titulo: string;
  artista: string;
  arquivoNome: string;
  sizeBytes: number | null;
  createdAt: Date;
};

export function foldMatchKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function artistTitleKey(artista: string, titulo: string): string {
  return `${foldMatchKey(artista)}|${foldMatchKey(titulo)}`;
}

/** Artista/título a partir do nome do MP3 legado (`Artista - Faixa~7.mp3`). */
export function legacyStemArtistTitle(relativePath: string): { artista: string; titulo: string } | null {
  const base = legacyMp3Basename(relativePath);
  const stripped = base.replace(/~\d+$/i, "").trim();
  const sep = stripped.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (!sep?.[1]?.trim() || !sep[2]?.trim()) return null;
  return { artista: sep[1].trim(), titulo: sep[2].trim() };
}

/** Nome do arquivo MP3 legado sem path (`Artista - Faixa~7.mp3`). */
export function legacyMp3Basename(relativePath: string): string {
  return relativePath.split("/").pop()?.replace(/\.mp3$/i, "") ?? "";
}

function legacyBasenameMatchKey(relativePath: string): string {
  return foldMatchKey(legacyMp3Basename(relativePath).replace(/~\d+$/i, ""));
}

function downloadBasenameMatchKey(arquivoNome: string): string {
  return foldMatchKey(arquivoNome.replace(/\.mp3$/i, "").replace(/~\d+$/i, ""));
}

function parseArtistTitleFromLine(line: string): { artista: string; titulo: string } | null {
  const trimmed = line.trim();
  if (!trimmed || deezerTrackIdFromUrl(trimmed)) return null;
  const sep = trimmed.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (!sep?.[1]?.trim() || !sep[2]?.trim()) return null;
  return { artista: sep[1].trim(), titulo: sep[2].trim() };
}

export type ItemMatchIndexes = {
  byDeezerId: Map<string, DownloadItemForMatch[]>;
  byArtistTitle: Map<string, DownloadItemForMatch[]>;
};

export function buildDownloadItemMatchIndexes(items: DownloadItemForMatch[]): ItemMatchIndexes {
  const byDeezerId = new Map<string, DownloadItemForMatch[]>();
  const byArtistTitle = new Map<string, DownloadItemForMatch[]>();

  const push = (map: Map<string, DownloadItemForMatch[]>, key: string, item: DownloadItemForMatch) => {
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  };

  for (const item of items) {
    const id = deezerTrackIdFromUrl(item.linhaOriginal);
    if (id) push(byDeezerId, id, item);

    if (item.artista.trim() && item.titulo.trim()) {
      push(byArtistTitle, artistTitleKey(item.artista, item.titulo), item);
    }

    const fromLine = parseArtistTitleFromLine(item.linhaOriginal);
    if (fromLine) {
      push(byArtistTitle, artistTitleKey(fromLine.artista, fromLine.titulo), item);
    }
  }

  return { byDeezerId, byArtistTitle };
}

function takeUnusedItem(
  candidates: DownloadItemForMatch[] | undefined,
  usedDownloadIds: Set<string>,
): DownloadItemForMatch | undefined {
  if (!candidates?.length) return undefined;
  return candidates.find((c) => !usedDownloadIds.has(c.id));
}

function matchByArtistTitle(
  wantA: string,
  wantT: string,
  indexes: ItemMatchIndexes,
  usedDownloadIds: Set<string>,
  opts?: { unavailableDownloadIds?: Set<string> },
  items?: DownloadItemForMatch[],
): DownloadItemForMatch | undefined {
  const key = artistTitleKey(wantA, wantT);
  const exact = takeUnusedItem(indexes.byArtistTitle.get(key), usedDownloadIds);
  if (exact && !unavailable(exact.id, opts)) return exact;

  const wantAF = foldMatchKey(wantA);
  const wantTF = foldMatchKey(wantT);
  for (const [k, list] of indexes.byArtistTitle) {
    const [ia, it] = k.split("|");
    if (ia !== wantAF) continue;
    if (it === wantTF || it.includes(wantTF) || wantTF.includes(it)) {
      const hit = takeUnusedItem(list, usedDownloadIds);
      if (hit && !unavailable(hit.id, opts)) return hit;
    }
  }
  return undefined;
}

function matchByLegacyBasename(
  track: ServidorUpUploadTrackInput,
  items: DownloadItemForMatch[],
  usedDownloadIds: Set<string>,
  opts?: { unavailableDownloadIds?: Set<string> },
): DownloadItemForMatch | undefined {
  const want = legacyBasenameMatchKey(track.relativePath);
  if (!want) return undefined;
  for (const item of items) {
    if (usedDownloadIds.has(item.id)) continue;
    if (unavailable(item.id, opts)) continue;
    if (downloadBasenameMatchKey(item.arquivoNome) === want) return item;
  }
  return undefined;
}

export function resolveDownloadItemForTrack(
  track: ServidorUpUploadTrackInput,
  indexes: ItemMatchIndexes,
  items: DownloadItemForMatch[],
  usedDownloadIds: Set<string>,
  opts?: {
    indexMap?: Map<string, DownloadItemForMatch>;
    unavailableDownloadIds?: Set<string>;
  },
): DownloadItemForMatch | undefined {
  const deezerId = deezerTrackIdFromUrl(track.deezerUrl);
  if (deezerId) {
    const hit = takeUnusedItem(indexes.byDeezerId.get(deezerId), usedDownloadIds);
    if (hit) return hit;
    for (const item of items) {
      if (usedDownloadIds.has(item.id)) continue;
      if (unavailable(item.id, opts)) continue;
      if (deezerTrackIdFromUrl(item.linhaOriginal) === deezerId) return item;
    }
  }

  const indexed = opts?.indexMap?.get(track.relativePath);
  if (indexed && !usedDownloadIds.has(indexed.id) && !unavailable(indexed.id, opts)) {
    return indexed;
  }

  const byBasename = matchByLegacyBasename(track, items, usedDownloadIds, opts);
  if (byBasename) return byBasename;

  const legacy = legacyStemArtistTitle(track.relativePath);
  if (legacy) {
    const hit = matchByArtistTitle(legacy.artista, legacy.titulo, indexes, usedDownloadIds, opts, items);
    if (hit) return hit;
  }

  const fromUrlLine = track.deezerUrl.trim();
  const parsedUrlLine = parseArtistTitleFromLine(fromUrlLine);
  if (parsedUrlLine) {
    const hit = matchByArtistTitle(parsedUrlLine.artista, parsedUrlLine.titulo, indexes, usedDownloadIds, opts, items);
    if (hit) return hit;
  }

  return undefined;
}

function unavailable(
  id: string,
  opts?: { unavailableDownloadIds?: Set<string> },
): boolean {
  return opts?.unavailableDownloadIds?.has(id) ?? false;
}

/**
 * Deemix é enfileirado na mesma ordem de `session.tracks` — pareia por índice global.
 * Usa todos os itens concluídos do job (incl. já importados) para manter o alinhamento.
 */
export function buildTrackToDownloadIndexMap(
  tracks: ServidorUpUploadTrackInput[],
  allJobItems: DownloadItemForMatch[],
): Map<string, DownloadItemForMatch> {
  const sortedItems = [...allJobItems].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const out = new Map<string, DownloadItemForMatch>();
  const limit = Math.min(tracks.length, sortedItems.length);
  for (let i = 0; i < limit; i++) {
    out.set(tracks[i]!.relativePath, sortedItems[i]!);
  }
  return out;
}

/** Fallback por índice global — só usa itens ainda disponíveis (não importados / não usados). */
export function resolveByGlobalEnqueueIndex(
  pendingTracks: ServidorUpUploadTrackInput[],
  indexMap: Map<string, DownloadItemForMatch>,
  usedDownloadIds: Set<string>,
  unavailableDownloadIds?: Set<string>,
): Map<string, DownloadItemForMatch> {
  const out = new Map<string, DownloadItemForMatch>();
  for (const track of pendingTracks) {
    const indexed = indexMap.get(track.relativePath);
    if (!indexed) continue;
    if (usedDownloadIds.has(indexed.id)) continue;
    if (unavailableDownloadIds?.has(indexed.id)) continue;
    out.set(track.relativePath, indexed);
  }
  return out;
}

/** @deprecated Prefer resolveByGlobalEnqueueIndex — mantido para compat em testes legados. */
export function resolveByEnqueueOrderFallback(
  pendingTracks: ServidorUpUploadTrackInput[],
  items: DownloadItemForMatch[],
  usedDownloadIds: Set<string>,
): Map<string, DownloadItemForMatch> {
  const indexMap = buildTrackToDownloadIndexMap(pendingTracks, items);
  return resolveByGlobalEnqueueIndex(pendingTracks, indexMap, usedDownloadIds);
}

/** Atualiza deezerUrl das faixas a partir dos itens baixados (para snapshot desatualizado). */
export function syncTrackDeezerUrlsFromItems(
  tracks: ServidorUpUploadTrackInput[],
  items: DownloadItemForMatch[],
): ServidorUpUploadTrackInput[] {
  const indexes = buildDownloadItemMatchIndexes(items);
  const used = new Set<string>();
  return tracks.map((track) => {
    const item = resolveDownloadItemForTrack(track, indexes, items, used);
    if (!item) return track;
    used.add(item.id);
    const id = deezerTrackIdFromUrl(item.linhaOriginal);
    if (!id) return track;
    const canonical = `https://www.deezer.com/track/${id}`;
    if (deezerTrackIdFromUrl(track.deezerUrl) === id) return track;
    return { ...track, deezerUrl: canonical };
  });
}
