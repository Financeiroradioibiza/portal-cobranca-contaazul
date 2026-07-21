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
  const base = relativePath.split("/").pop()?.replace(/\.mp3$/i, "") ?? "";
  const stripped = base.replace(/~\d+$/i, "").trim();
  const sep = stripped.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (!sep?.[1]?.trim() || !sep[2]?.trim()) return null;
  return { artista: sep[1].trim(), titulo: sep[2].trim() };
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
): DownloadItemForMatch | undefined {
  const key = artistTitleKey(wantA, wantT);
  const exact = takeUnusedItem(indexes.byArtistTitle.get(key), usedDownloadIds);
  if (exact) return exact;

  const wantAF = foldMatchKey(wantA);
  const wantTF = foldMatchKey(wantT);
  for (const [k, list] of indexes.byArtistTitle) {
    const [ia, it] = k.split("|");
    if (ia !== wantAF) continue;
    if (it === wantTF || it.includes(wantTF) || wantTF.includes(it)) {
      const hit = takeUnusedItem(list, usedDownloadIds);
      if (hit) return hit;
    }
  }
  return undefined;
}

export function resolveDownloadItemForTrack(
  track: ServidorUpUploadTrackInput,
  indexes: ItemMatchIndexes,
  items: DownloadItemForMatch[],
  usedDownloadIds: Set<string>,
): DownloadItemForMatch | undefined {
  const deezerId = deezerTrackIdFromUrl(track.deezerUrl);
  if (deezerId) {
    const hit = takeUnusedItem(indexes.byDeezerId.get(deezerId), usedDownloadIds);
    if (hit) return hit;
    for (const item of items) {
      if (usedDownloadIds.has(item.id)) continue;
      if (deezerTrackIdFromUrl(item.linhaOriginal) === deezerId) return item;
    }
  }

  const legacy = legacyStemArtistTitle(track.relativePath);
  if (legacy) {
    const hit = matchByArtistTitle(legacy.artista, legacy.titulo, indexes, usedDownloadIds);
    if (hit) return hit;
  }

  const fromUrlLine = track.deezerUrl.trim();
  const parsedUrlLine = parseArtistTitleFromLine(fromUrlLine);
  if (parsedUrlLine) {
    const hit = matchByArtistTitle(parsedUrlLine.artista, parsedUrlLine.titulo, indexes, usedDownloadIds);
    if (hit) return hit;
  }

  return undefined;
}

/** Quando URLs do snapshot divergem do job, alinha pela ordem de enfileiramento (mesmo lote legado). */
export function resolveByEnqueueOrderFallback(
  pendingTracks: ServidorUpUploadTrackInput[],
  items: DownloadItemForMatch[],
  usedDownloadIds: Set<string>,
): Map<string, DownloadItemForMatch> {
  const out = new Map<string, DownloadItemForMatch>();
  const freeItems = items
    .filter((i) => !usedDownloadIds.has(i.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  if (freeItems.length < pendingTracks.length * 0.85) return out;

  for (let i = 0; i < pendingTracks.length && i < freeItems.length; i++) {
    out.set(pendingTracks[i]!.relativePath, freeItems[i]!);
  }
  return out;
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
