"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResolvedTrack } from "@/lib/criacao/trackListParse";
import {
  fetchLocalDownloadFiles,
  getLocalDownloadJob,
  pingLocalDownloader,
  startLocalDownload,
  type LocalDownloadJob,
} from "@/lib/criacao/localDownloaderClient";

type Props = {
  onFilesReady: (files: File[]) => void;
};

type ResolveMode = "spotify" | "txt";

async function resolveTracksApi(
  mode: ResolveMode,
  spotifyUrl: string,
  txt: string,
): Promise<ResolvedTrack[]> {
  const res = await fetch("/api/criacao/download/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      mode === "spotify" ?
        { mode: "spotify", spotifyUrl: spotifyUrl.trim() }
      : { mode: "txt", text: txt },
    ),
  });
  const data = (await res.json()) as { ok?: boolean; tracks?: ResolvedTrack[]; error?: string };
  if (!res.ok || !data.ok) {
    if (data.error === "spotify_not_configured") {
      throw new Error("Spotify não configurado — use lista TXT ou configure SPOTIFY_CLIENT_ID/SECRET.");
    }
    throw new Error(data.error ?? "Não foi possível ler a playlist.");
  }
  return data.tracks ?? [];
}

export function ExternoDownloadPanel({ onFilesReady }: Props) {
  const [mode, setMode] = useState<ResolveMode>("spotify");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [txt, setTxt] = useState("");
  const [tracks, setTracks] = useState<ResolvedTrack[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [localOk, setLocalOk] = useState<boolean | null>(null);
  const [downloadJob, setDownloadJob] = useState<LocalDownloadJob | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const importedJobId = useRef<string | null>(null);

  const checkLocal = useCallback(async () => {
    setLocalOk(await pingLocalDownloader());
  }, []);

  useEffect(() => {
    void checkLocal();
    const t = setInterval(() => void checkLocal(), 8000);
    return () => clearInterval(t);
  }, [checkLocal]);

  useEffect(() => {
    if (!downloadJob || downloadJob.status === "done" || downloadJob.status === "failed") {
      return;
    }
    const t = setInterval(async () => {
      try {
        const j = await getLocalDownloadJob(downloadJob.id);
        setDownloadJob(j);
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => clearInterval(t);
  }, [downloadJob]);

  useEffect(() => {
    if (!downloadJob || downloadJob.status !== "done") return;
    if (importedJobId.current === downloadJob.id) return;
    importedJobId.current = downloadJob.id;

    void (async () => {
      try {
        const files = await fetchLocalDownloadFiles(downloadJob.id);
        if (files.length === 0) {
          const failed = downloadJob.items.filter((i) => i.status === "failed");
          const detail = failed[0]?.error ?? "Verifique ffmpeg e yt-dlp no terminal do downloader.";
          throw new Error(
            failed.length > 0 ?
              `Nenhum MP3 baixado. Ex.: ${detail}`
            : "Nenhum MP3 retornado.",
          );
        }
        onFilesReady(files);
        setMsg(`${files.length} faixa(s) na lista de upload — revise e envie.`);
      } catch (e) {
        importedJobId.current = null;
        setErr(e instanceof Error ? e.message : "Falha ao importar os arquivos.");
      }
    })();
  }, [downloadJob, onFilesReady]);

  async function baixar() {
    setErr(null);
    setMsg(null);
    setTracks([]);
    setDownloadJob(null);
    importedJobId.current = null;

    if (!localOk) {
      setShowSetup(true);
      setErr("Abra o Iniciar-Downloader uma vez (veja instruções abaixo) e tente de novo.");
      return;
    }

    setBusy(true);
    try {
      const resolved = await resolveTracksApi(mode, spotifyUrl, txt);
      if (resolved.length === 0) throw new Error("Nenhuma faixa encontrada.");
      setTracks(resolved);
      setMsg(`Baixando ${resolved.length} faixa(s)… pode deixar esta aba aberta.`);

      const job = await startLocalDownload(
        resolved.map((t) => ({
          title: t.title,
          artist: t.artist,
          suggestedFilename: t.suggestedFilename,
        })),
      );
      setDownloadJob(job);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao iniciar download.");
    } finally {
      setBusy(false);
    }
  }

  const progress =
    downloadJob ?
      `${downloadJob.done}/${downloadJob.total} · ${downloadJob.status}`
    : null;

  return (
    <div className="mb-4 space-y-4 rounded-xl border border-sky-200 bg-sky-50/80 p-4 dark:border-sky-900 dark:bg-sky-950/30">
      <div>
        <p className="text-sm font-semibold text-sky-900 dark:text-sky-100">Baixar playlist</p>
        <p className="mt-1 text-xs text-sky-800/90 dark:text-sky-200/80">
          Cole o link (como no player-preview) e clique <strong>Baixar</strong>. O áudio baixa no{" "}
          <strong>seu PC</strong> — a empresa bloqueia download no servidor Netlify.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMode("spotify")}
          className={
            "rounded-lg px-3 py-1.5 font-semibold " +
            (mode === "spotify" ? "bg-sky-900 text-white" : "bg-white text-sky-800 dark:bg-slate-900")
          }
        >
          Spotify
        </button>
        <button
          type="button"
          onClick={() => setMode("txt")}
          className={
            "rounded-lg px-3 py-1.5 font-semibold " +
            (mode === "txt" ? "bg-sky-900 text-white" : "bg-white text-sky-800 dark:bg-slate-900")
          }
        >
          Lista TXT
        </button>
        <span
          className={
            "ml-auto rounded-lg px-2 py-1.5 font-semibold " +
            (localOk ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900")
          }
        >
          {localOk === null ? "…" : localOk ? "Pronto" : "Abra o Iniciar-Downloader"}
        </span>
      </div>

      {mode === "spotify" ?
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void baixar();
          }}
        >
          <input
            value={spotifyUrl}
            onChange={(e) => setSpotifyUrl(e.target.value)}
            placeholder="https://open.spotify.com/playlist/…"
            className="min-w-0 flex-1 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm dark:border-sky-800 dark:bg-slate-950"
          />
          <button
            type="submit"
            disabled={busy || !spotifyUrl.trim()}
            className="rounded-lg bg-sky-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Iniciando…" : downloadJob?.status === "running" ? "Baixando…" : "Baixar playlist"}
          </button>
        </form>
      : <div className="space-y-2">
          <textarea
            value={txt}
            onChange={(e) => setTxt(e.target.value)}
            rows={5}
            placeholder={"Artista - Título\nMadonna - Like a Prayer"}
            className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 font-mono text-sm dark:border-sky-800 dark:bg-slate-950"
          />
          <button
            type="button"
            disabled={busy || !txt.trim()}
            onClick={() => void baixar()}
            className="rounded-lg bg-sky-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Iniciando…" : "Baixar lista"}
          </button>
        </div>
      }

      {progress ?
        <p className="text-xs text-sky-900 dark:text-sky-100">
          Progresso: <strong>{progress}</strong>
          {downloadJob && downloadJob.failed > 0 ?
            ` · ${downloadJob.failed} falha(s)`
          : null}
        </p>
      : null}
      {msg ?
        <p className="text-xs text-emerald-800 dark:text-emerald-200">{msg}</p>
      : null}
      {err ?
        <p className="text-xs text-red-600">{err}</p>
      : null}

      {(localOk === false || showSetup) ?
        <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 open:pb-3 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <summary className="cursor-pointer font-semibold">Setup único no PC (1× por máquina)</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>
              Duplo clique em{" "}
              <code className="rounded bg-white/80 px-1">tools/local-downloader/Iniciar-Downloader.command</code>{" "}
              (Mac) ou <code className="rounded bg-white/80 px-1">Iniciar-Downloader.bat</code> (Windows).
            </li>
            <li>Deixe a janela aberta. Se disser “já está rodando”, está ok — não abra de novo.</li>
            <li>
              1ª vez: abra{" "}
              <a
                href="https://127.0.0.1:8765/health"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                https://127.0.0.1:8765/health
              </a>{" "}
              e aceite o certificado.
            </li>
            <li>Recarregue o portal e clique Baixar de novo.</li>
          </ol>
          <p className="mt-2 text-[11px] opacity-90">
            No preview o worker rodava no Railway (invisível). Aqui o yt-dlp precisa do seu IP — por isso esse
            atalho local.
          </p>
        </details>
      : null}

      {tracks.length > 0 ?
        <div className="max-h-36 overflow-auto rounded-lg border border-sky-200 bg-white dark:border-sky-800 dark:bg-slate-950">
          <ul className="divide-y divide-sky-100 text-xs dark:divide-sky-900">
            {tracks.map((t, i) => (
              <li key={`${t.title}-${i}`} className="px-3 py-1.5">
                <span className="font-medium">{t.title}</span>
                {t.artist ?
                  <span className="text-slate-500"> · {t.artist}</span>
                : null}
                {downloadJob?.items[i]?.status ?
                  <span className="ml-2 text-slate-400">({downloadJob.items[i]?.status})</span>
                : null}
              </li>
            ))}
          </ul>
        </div>
      : null}
    </div>
  );
}
