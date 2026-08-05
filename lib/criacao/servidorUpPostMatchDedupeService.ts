import {
  buildBibliotecaMetadataIndex,
  findBibliotecaMetadataHit,
} from "@/lib/criacao/servidorUpMetadataDedupe";
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
  });

  const metadataIndex = buildBibliotecaMetadataIndex(rows);
  const hits: PostMatchBibliotecaHit[] = [];
  const seenPaths = new Set<string>();

  for (const track of tracks) {
    if (seenPaths.has(track.relativePath)) continue;
    const hit = findBibliotecaMetadataHit(
      track.deezerArtista,
      track.deezerTitulo,
      track.durationSec,
      metadataIndex,
    );
    if (!hit) continue;
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
