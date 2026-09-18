import JSZip from "jszip";
import type { PlaylistDownloadManifest } from "@/lib/criacao/playlistDownloadService";

export type PlaylistZipProgress = {
  phase: "fetching" | "zipping" | "done" | "error";
  done: number;
  total: number;
  currentLabel?: string;
  error?: string;
};

export async function downloadPlaylistAsZip(
  manifest: PlaylistDownloadManifest,
  onProgress?: (p: PlaylistZipProgress) => void,
): Promise<void> {
  const toFetch = manifest.tracks.filter((t) => t.downloadUrl);
  if (toFetch.length === 0) {
    onProgress?.({ phase: "error", done: 0, total: 0, error: "Nenhuma faixa com master 192k no B2." });
    throw new Error("sem_faixas_baixaveis");
  }

  const zip = new JSZip();
  const manifestJson = {
    programacaoId: manifest.programacaoId,
    cliente: manifest.clienteNome,
    programacao: manifest.programacaoNome,
    geradoEm: new Date().toISOString(),
    total: manifest.totalFaixas,
    baixadas: toFetch.length,
    omitidas: manifest.omitidas,
    omitidasDetalhe: manifest.tracks
      .filter((t) => !t.downloadUrl)
      .map((t) => ({ path: t.zipRelativePath, motivo: t.skipReason, titulo: t.titulo })),
  };
  zip.file("manifest.json", JSON.stringify(manifestJson, null, 2));
  zip.file(
    "LEIA-ME.txt",
    [
      `Programação: ${manifest.clienteNome} / ${manifest.programacaoNome}`,
      `Faixas no ZIP: ${toFetch.length} (master 192 kbps, Backblaze B2)`,
      manifest.omitidas > 0 ?
        `Omitidas (sem master no B2): ${manifest.omitidas} — ver manifest.json`
      : "",
      "",
      "Estrutura: Cliente / Programação / Pasta / faixa.mp3",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  let done = 0;
  const total = toFetch.length;

  for (const track of toFetch) {
    onProgress?.({
      phase: "fetching",
      done,
      total,
      currentLabel: `${track.artista} — ${track.titulo}`.slice(0, 80),
    });

    const url = track.downloadUrl!;
    const crossOrigin = /^https?:\/\//i.test(url);
    let res: Response;
    try {
      res = await fetch(
        url,
        crossOrigin ? { mode: "cors" } : { credentials: "same-origin" },
      );
    } catch {
      onProgress?.({
        phase: "error",
        done,
        total,
        error: crossOrigin ?
          `Falha ao baixar «${track.titulo}» via cloud3 (rede/CORS — deploy do worker?)`
        : `Falha ao baixar «${track.titulo}» (rede)`,
      });
      throw new Error(`fetch_failed:${track.musicaId}:network:${track.titulo.slice(0, 60)}`);
    }
    if (!res.ok) {
      onProgress?.({
        phase: "error",
        done,
        total,
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

  onProgress?.({ phase: "zipping", done: total, total, currentLabel: "Compactando…" });

  const blob = await zip.generateAsync(
    { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
    (meta) => {
      if (meta.percent >= 99) {
        onProgress?.({ phase: "zipping", done: total, total, currentLabel: "Finalizando…" });
      }
    },
  );

  const safeName = manifest.zipRootFolder.replace(/[^\w\s.-]+/g, "_").slice(0, 80);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName || "playlist"}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  onProgress?.({ phase: "done", done: total, total });
}
