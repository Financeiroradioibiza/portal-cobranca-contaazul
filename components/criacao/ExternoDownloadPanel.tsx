"use client";

import { useCallback, useEffect, useState } from "react";
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

export function ExternoDownloadPanel({ onFilesReady }: Props) {
  const [mode, setMode] = useState<ResolveMode>("spotify");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [txt, setTxt] = useState("");
  const [tracks, setTracks] = useState<ResolvedTrack[]>([]);
  const [resolveBusy, setResolveBusy] = useState(false);
  const [resolveErr, setResolveErr] = useState<string | null>(null);
  const [localOk, setLocalOk] = useState<boolean | null>(null);
  const [downloadJob, setDownloadJob] = useState<LocalDownloadJob | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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

  async function resolveTracks() {
    setResolveBusy(true);
    setResolveErr(null);
    setMsg(null);
    setTracks([]);
    setDownloadJob(null);
    try {
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
          throw new Error("Spotify não configurado no portal — use lista TXT ou configure SPOTIFY_CLIENT_ID/SECRET.");
        }
        throw new Error(data.error ?? "resolve_failed");
      }
      setTracks(data.tracks ?? []);
    } catch (e) {
      setResolveErr(e instanceof Error ? e.message : "Erro ao resolver faixas.");
    } finally {
      setResolveBusy(false);
    }
  }

  async function startDownload() {
    if (tracks.length === 0) return;
    if (!localOk) {
      setMsg(
        "Inicie o downloader: duplo clique em tools/local-downloader/Iniciar-Downloader.bat (Windows) ou Iniciar-Downloader.command (Mac).",
      );
      return;
    }
    setDownloadBusy(true);
    setMsg(null);
    try {
      const job = await startLocalDownload(
        tracks.map((t) => ({
          title: t.title,
          artist: t.artist,
          suggestedFilename: t.suggestedFilename,
        })),
      );
      setDownloadJob(job);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao iniciar download local.");
    } finally {
      setDownloadBusy(false);
    }
  }

  async function importToUpload() {
    if (!downloadJob || downloadJob.status !== "done") return;
    setDownloadBusy(true);
    setMsg(null);
    try {
      const files = await fetchLocalDownloadFiles(downloadJob.id);
      if (files.length === 0) throw new Error("Nenhum arquivo retornado.");
      onFilesReady(files);
      setMsg(`${files.length} arquivo(s) prontos — confira a lista abaixo e envie.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao importar arquivos.");
    } finally {
      setDownloadBusy(false);
    }
  }

  return (
    <div className="mb-4 space-y-4 rounded-xl border border-sky-200 bg-sky-50/80 p-4 dark:border-sky-900 dark:bg-sky-950/30">
      <div>
        <p className="text-sm font-semibold text-sky-900 dark:text-sky-100">Baixar no seu computador</p>
        <p className="mt-1 text-xs text-sky-800/90 dark:text-sky-200/80">
          Igual ao <strong>player-preview-2026</strong>: metadados do Spotify (ou TXT) +{" "}
          <strong>yt-dlp no seu IP</strong>. O servidor da empresa não baixa áudio.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setMode("spotify")}
          className={
            "rounded-lg px-3 py-1.5 " +
            (mode === "spotify" ? "bg-sky-900 text-white" : "bg-white text-sky-800 dark:bg-slate-900")
          }
        >
          Link Spotify
        </button>
        <button
          type="button"
          onClick={() => setMode("txt")}
          className={
            "rounded-lg px-3 py-1.5 " +
            (mode === "txt" ? "bg-sky-900 text-white" : "bg-white text-sky-800 dark:bg-slate-900")
          }
        >
          Lista TXT
        </button>
        <span
          className={
            "ml-auto rounded-lg px-2 py-1.5 " +
            (localOk ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900")
          }
        >
          App local: {localOk === null ? "…" : localOk ? "conectado" : "offline"}
        </span>
      </div>

      {localOk === false ?
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          1) Duplo clique em <strong>Iniciar-Downloader</strong> e deixe a janela aberta.{" "}
          2) Na <strong>primeira vez</strong>, abra{" "}
          <a
            href="https://127.0.0.1:8765/health"
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline"
          >
            https://127.0.0.1:8765/health
          </a>{" "}
          e aceite o certificado. 3) Recarregue esta página.
        </p>
      : null}

      {mode === "spotify" ?
        <input
          value={spotifyUrl}
          onChange={(e) => setSpotifyUrl(e.target.value)}
          placeholder="https://open.spotify.com/playlist/… ou album/…"
          className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm dark:border-sky-800 dark:bg-slate-950"
        />
      : <textarea
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          rows={6}
          placeholder={"Artista - Título\nMadonna - Like a Prayer\n# linhas com # são ignoradas"}
          className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 font-mono text-sm dark:border-sky-800 dark:bg-slate-950"
        />
      }

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={resolveBusy}
          onClick={() => void resolveTracks()}
          className="rounded-lg bg-sky-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {resolveBusy ? "Resolvendo…" : "1. Resolver faixas"}
        </button>
        <button
          type="button"
          disabled={downloadBusy || tracks.length === 0}
          onClick={() => void startDownload()}
          className="rounded-lg border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-900 disabled:opacity-50 dark:bg-slate-900 dark:text-sky-100"
        >
          2. Baixar local (yt-dlp)
        </button>
        {downloadJob?.status === "done" ?
          <button
            type="button"
            disabled={downloadBusy}
            onClick={() => void importToUpload()}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            3. Usar no upload
          </button>
        : null}
      </div>

      {resolveErr ?
        <p className="text-xs text-red-600">{resolveErr}</p>
      : null}
      {msg ?
        <p className="text-xs text-sky-900 dark:text-sky-100">{msg}</p>
      : null}

      {tracks.length > 0 ?
        <div className="max-h-40 overflow-auto rounded-lg border border-sky-200 bg-white dark:border-sky-800 dark:bg-slate-950">
          <ul className="divide-y divide-sky-100 text-xs dark:divide-sky-900">
            {tracks.map((t, i) => (
              <li key={`${t.title}-${i}`} className="px-3 py-1.5">
                <span className="font-medium">{t.title}</span>
                {t.artist ?
                  <span className="text-slate-500"> · {t.artist}</span>
                : null}
              </li>
            ))}
          </ul>
          <p className="border-t border-sky-100 px-3 py-1 text-[10px] text-slate-500 dark:border-sky-900">
            {tracks.length} faixa(s)
          </p>
        </div>
      : null}

      {downloadJob ?
        <div className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs dark:border-sky-800 dark:bg-slate-950">
          <p>
            Download local: <strong>{downloadJob.done}</strong>/{downloadJob.total} ok
            {downloadJob.failed > 0 ? ` · ${downloadJob.failed} falha(s)` : ""} · {downloadJob.status}
          </p>
          {!localOk ?
            <p className="mt-1 text-amber-700">
              Duplo clique em{" "}
              <code className="rounded bg-slate-100 px-1">Iniciar-Downloader.bat</code> (Windows) ou{" "}
              <code className="rounded bg-slate-100 px-1">Iniciar-Downloader.command</code> (Mac) na pasta{" "}
              <code className="rounded bg-slate-100 px-1">tools/local-downloader</code>
            </p>
          : null}
        </div>
      : null}
    </div>
  );
}
