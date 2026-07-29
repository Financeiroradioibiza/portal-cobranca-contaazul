import { prisma } from "@/lib/prisma";
import { buildStagingPreviewUrl, streamEnabled } from "@/lib/criacao/streamUrl";
import type { ServidorUpUploadPlan } from "@/lib/criacao/servidorUpUploadService";

export type ServidorUpTrackVerifyRow = {
  downloadItemId: string;
  relativePath: string;
  legacyLabel: string;
  deemixLabel: string;
  stagingPreviewUrl: string | null;
  stagingReady: boolean;
};

export type ServidorUpDownloadVerifyPayload = {
  tracks: ServidorUpTrackVerifyRow[];
  streamEnabled: boolean;
};

export async function buildServidorUpDownloadVerify(
  downloadJobId: string,
  plan: ServidorUpUploadPlan,
): Promise<ServidorUpDownloadVerifyPayload> {
  const itemIds = plan.lotes.flatMap((l) => l.tracks.map((t) => t.downloadItemId));
  const stagingById = new Map<string, boolean>();

  if (itemIds.length > 0) {
    const rows = await prisma.downloadItem.findMany({
      where: { id: { in: itemIds }, jobId: downloadJobId },
      select: { id: true, storageKey: true, status: true },
    });
    for (const row of rows) {
      const ready =
        row.status === "concluido" &&
        typeof row.storageKey === "string" &&
        row.storageKey.startsWith("download-staging:");
      stagingById.set(row.id, ready);
    }
  }

  const tracks: ServidorUpTrackVerifyRow[] = [];
  for (const lote of plan.lotes) {
    for (const track of lote.tracks) {
      const stagingReady = stagingById.get(track.downloadItemId) ?? false;
      tracks.push({
        downloadItemId: track.downloadItemId,
        relativePath: track.relativePath,
        legacyLabel: track.relativePath.split("/").pop() || track.relativePath,
        deemixLabel:
          track.artista && track.titulo ?
            `${track.artista} — ${track.titulo}`
          : track.titulo || track.arquivoNome,
        stagingPreviewUrl:
          stagingReady && streamEnabled() ? buildStagingPreviewUrl(track.downloadItemId) : null,
        stagingReady,
      });
    }
  }

  return { tracks, streamEnabled: streamEnabled() };
}
