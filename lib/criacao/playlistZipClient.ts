import JSZip from "jszip";
import type { PlaylistDownloadManifest, PlaylistDownloadTrack } from "@/lib/criacao/playlistDownloadService";
import { PLAYLIST_ZIP_TRACKS_PER_PART } from "@/lib/criacao/playlistZipLimits";

export type PlaylistZipProgress = {
  phase: "fetching" | "zipping" | "done" | "error";
  done: number;
  total: number;
  partIndex?: number;
  partCount?: number;
  overallDone?: number;
  overallTotal?: number;
  currentLabel?: string;
  error?: string;
};

function chunkTracks(tracks: PlaylistDownloadTrack[], size: number): PlaylistDownloadTrack[][] {
  const out: PlaylistDownloadTrack[][] = [];
  for (let i = 0; i < tracks.length; i += size) {
    out.push(tracks.slice(i, i + size));
  }
  return out;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function buildPartZipBlob(
  manifest: PlaylistDownloadManifest,
  partTracks: PlaylistDownloadTrack[],
  partIndex: number,
  partCount: number,
  onProgress?: (p: PlaylistZipProgress) => void,
  overallOffset = 0,
  overallTotal = partTracks.length,
): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        programacaoId: manifest.programacaoId,
        cliente: manifest.clienteNome,
        programacao: manifest.programacaoNome,
        geradoEm: new Date().toISOString(),
        parte: partIndex,
        partes: partCount,
        faixasNestaParte: partTracks.length,
        totalNaProgramacao: manifest.totalFaixas,
        baixadasTotal: manifest.baixaveis,
        omitidas: manifest.omitidas,
        omitidasDetalhe: manifest.tracks
          .filter((t) => !t.downloadUrl)
          .map((t) => ({ path: t.zipRelativePath, motivo: t.skipReason, titulo: t.titulo })),
      },
      null,
      2,
    ),
  );
  zip.file(
    "LEIA-ME.txt",
    [
      `Programação: ${manifest.clienteNome} / ${manifest.programacaoNome}`,
      `Parte ${partIndex} de ${partCount}`,
      `Faixas neste ZIP: ${partTracks.length} (master 192 kbps, cloud3 → B2)`,
      manifest.omitidas > 0 ?
        `Omitidas na programação (sem master no B2): ${manifest.omitidas} — ver manifest.json`
      : "",
      "",
      "Estrutura: Cliente / Programação / Pasta / faixa.mp3",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  let done = 0;
  const total = partTracks.length;

  for (const track of partTracks) {
    onProgress?.({
      phase: "fetching",
      done,
      total,
      partIndex,
      partCount,
      overallDone: overallOffset + done,
      overallTotal,
      currentLabel: `${track.artista} — ${track.titulo}`.slice(0, 80),
    });

    const url = track.downloadUrl!;
    let res: Response;
    try {
      res = await fetch(url, { mode: "cors", credentials: "omit", cache: "no-store" });
    } catch {
      onProgress?.({
        phase: "error",
        done,
        total,
        partIndex,
        partCount,
        overallDone: overallOffset + done,
        overallTotal,
        error: `Rede ao baixar «${track.titulo}» via cloud3`,
      });
      throw new Error(`fetch_failed:${track.musicaId}:network:${track.titulo.slice(0, 60)}`);
    }
    if (!res.ok) {
      onProgress?.({
        phase: "error",
        done,
        total,
        partIndex,
        partCount,
        overallDone: overallOffset + done,
        overallTotal,
        error: `Falha ao baixar «${track.titulo}» (${res.status})`,
      });
      throw new Error(
        `fetch_failed:${track.musicaId}:${res.status}:${track.titulo.slice(0, 60)}`,
      );
    }
    const buf = await res.arrayBuffer();
    zip.file(track.zipRelativePath, buf);
    done += 1;
  }

  onProgress?.({
    phase: "zipping",
    done: total,
    total,
    partIndex,
    partCount,
    overallDone: overallOffset + total,
    overallTotal,
    currentLabel: "Compactando…",
  });

  return zip.generateAsync(
    { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
    (meta) => {
      if (meta.percent >= 99) {
        onProgress?.({
          phase: "zipping",
          done: total,
          total,
          partIndex,
          partCount,
          overallDone: overallOffset + total,
          overallTotal,
          currentLabel: "Finalizando…",
        });
      }
    },
  );
}

export async function downloadPlaylistAsZip(
  manifest: PlaylistDownloadManifest,
  onProgress?: (p: PlaylistZipProgress) => void,
): Promise<void> {
  const toFetch = manifest.tracks.filter((t) => t.downloadUrl);
  if (toFetch.length === 0) {
    onProgress?.({ phase: "error", done: 0, total: 0, error: "Nenhuma faixa com master 192k no B2." });
    throw new Error("sem_faixas_baixaveis");
  }

  const parts = chunkTracks(toFetch, PLAYLIST_ZIP_TRACKS_PER_PART);
  const partCount = parts.length;
  const overallTotal = toFetch.length;
  const safeName = manifest.zipRootFolder.replace(/[^\w\s.-]+/g, "_").slice(0, 72);

  let overallOffset = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const partIndex = i + 1;
    const partTracks = parts[i]!;

    const blob = await buildPartZipBlob(
      manifest,
      partTracks,
      partIndex,
      partCount,
      onProgress,
      overallOffset,
      overallTotal,
    );

    const suffix = partCount === 1 ? "" : `-zip${partIndex}`;
    triggerBlobDownload(blob, `${safeName || "playlist"}${suffix}.zip`);

    overallOffset += partTracks.length;

    if (i < parts.length - 1) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  onProgress?.({
    phase: "done",
    done: overallTotal,
    total: overallTotal,
    partIndex: partCount,
    partCount,
    overallDone: overallTotal,
    overallTotal,
  });
}
