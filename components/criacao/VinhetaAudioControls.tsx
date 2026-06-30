"use client";

import { useRef, useState } from "react";
import { uploadVinhetaAudio, vinhetaUploadErrorMessage } from "@/lib/criacao/vinhetaUploadClient";

export function VinhetaAudioControls({
  vinhetaId,
  tipo,
  temAudio,
  previewUrl,
  compact = false,
  onUploaded,
}: {
  vinhetaId: string;
  tipo: string;
  temAudio: boolean;
  previewUrl: string | null;
  compact?: boolean;
  onUploaded?: () => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);

  const manualUpload = tipo === "audio";
  const canPlay = Boolean(temAudio && previewUrl);

  if (tipo !== "audio" && tipo !== "ia") return null;

  async function onFile(file: File | undefined) {
    if (!file || busy || !manualUpload) return;
    setBusy(true);
    try {
      await uploadVinhetaAudio(vinhetaId, file);
      await onUploaded?.();
    } catch (e) {
      const code = e instanceof Error ? e.message : "upload_falhou";
      alert(vinhetaUploadErrorMessage(code));
    } finally {
      setBusy(false);
    }
  }

  function togglePlay() {
    const a = audioRef.current;
    if (!a || !previewUrl) return;
    if (playing) {
      a.pause();
      return;
    }
    a.src = previewUrl;
    a.play().then(() => setPlaying(true), () => setPlaying(false));
  }

  const btn = compact ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5";

  return (
    <>
      <audio ref={audioRef} className="hidden" onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} />
      {manualUpload ?
        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,.mp3"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            void onFile(f);
            e.target.value = "";
          }}
        />
      : null}
      {canPlay ?
        <button
          type="button"
          onClick={togglePlay}
          className={
            `shrink-0 rounded font-semibold ${btn} ` +
            (playing ?
              "bg-emerald-600 text-white"
            : "border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300")
          }
          title="Ouvir vinheta"
        >
          {playing ? "⏸" : "▶"}
        </button>
      : null}
      {manualUpload ?
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className={
            `shrink-0 rounded border font-semibold ${btn} ` +
            (temAudio ?
              "border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-300"
            : "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200")
          }
          title={temAudio ? "Trocar MP3" : "Enviar MP3"}
        >
          {busy ? "…" : temAudio ? "trocar" : "MP3"}
        </button>
      : null}
    </>
  );
}
