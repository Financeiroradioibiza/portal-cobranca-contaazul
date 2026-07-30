import { metadataDedupeKey } from "@/lib/criacao/dedupeNormalize";
import { prisma } from "@/lib/prisma";

export type PostMatchTrackInput = {
  relativePath: string;
  deezerArtista: string;
  deezerTitulo: string;
  durationSec?: number | null;
};

export type PostMatchBibliotecaHit = {
  relativePath: string;
  musicaId: string;
  musicaArtista: string;
  musicaTitulo: string;
  via: "metadata";
};

function durationClose(aSec: number | null | undefined, bMs: number | null, toleranceSec = 4): boolean {
  if (aSec == null || bMs == null) return true;
  return Math.abs(aSec - bMs / 1000) <= toleranceSec;
}

/**
 * Mesma regra de metadata do cloud2 (fila dedupe) — evita Deemix+upload de faixa que já está no acervo.
 * Usa artista/título do match Deezer, não do nome legado no disco.
 */
export async function batchPostMatchBibliotecaCheck(
  tracks: PostMatchTrackInput[],
): Promise<PostMatchBibliotecaHit[]> {
  if (tracks.length === 0) return [];

  const rows = await prisma.musicaBiblioteca.findMany({
    where: { status: { in: ["pronta", "processando"] } },
    select: { id: true, artista: true, titulo: true, durationMs: true },
    orderBy: { updatedAt: "desc" },
    take: 8000,
  });

  const byMeta = new Map<string, (typeof rows)[0]>();
  for (const row of rows) {
    const key = metadataDedupeKey(row.artista, row.titulo);
    if (key.length > 3 && !byMeta.has(key)) byMeta.set(key, row);
  }

  const hits: PostMatchBibliotecaHit[] = [];
  const seenPaths = new Set<string>();

  for (const track of tracks) {
    if (seenPaths.has(track.relativePath)) continue;
    const key = metadataDedupeKey(track.deezerArtista, track.deezerTitulo);
    if (key.length <= 3) continue;
    const hit = byMeta.get(key);
    if (!hit) continue;
    if (!durationClose(track.durationSec, hit.durationMs)) continue;
    seenPaths.add(track.relativePath);
    hits.push({
      relativePath: track.relativePath,
      musicaId: hit.id,
      musicaArtista: hit.artista,
      musicaTitulo: hit.titulo,
      via: "metadata",
    });
  }

  return hits;
}
