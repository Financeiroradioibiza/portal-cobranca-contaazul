import { appendDownloadJobItems } from "@/lib/criacao/downloadService";
import {
  buildTrackToDownloadIndexMap,
  deezerTrackIdFromUrl,
} from "@/lib/criacao/servidorUpUploadReconcile";
import { getServidorUpUploadSnapshot } from "@/lib/criacao/servidorUpUploadSnapshotService";
import { prisma } from "@/lib/prisma";

const APPEND_CHUNK = 8;

/** Garante um item Deemix por faixa do snapshot (mesma ordem do Entregar). */
export async function ensureDeemixItemsForSnapshot(
  downloadJobId: string,
): Promise<{ appended: number; missingBefore: number }> {
  const snapshot = await getServidorUpUploadSnapshot(downloadJobId);
  if (!snapshot?.tracks?.length) return { appended: 0, missingBefore: 0 };

  const items = await prisma.downloadItem.findMany({
    where: { jobId: downloadJobId },
    select: {
      id: true,
      linhaOriginal: true,
      titulo: true,
      artista: true,
      arquivoNome: true,
      sizeBytes: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const indexMap = buildTrackToDownloadIndexMap(snapshot.tracks, items);
  const missingUrls: string[] = [];
  for (const track of snapshot.tracks) {
    if (indexMap.has(track.relativePath)) continue;
    const url = track.deezerUrl?.trim();
    if (url && deezerTrackIdFromUrl(url)) missingUrls.push(url);
  }

  if (missingUrls.length === 0) return { appended: 0, missingBefore: 0 };

  let appended = 0;
  for (let i = 0; i < missingUrls.length; i += APPEND_CHUNK) {
    const chunk = missingUrls.slice(i, i + APPEND_CHUNK);
    const r = await appendDownloadJobItems({
      jobId: downloadJobId,
      linhas: chunk.join("\n"),
    });
    appended += r.added;
  }

  return { appended, missingBefore: missingUrls.length };
}
