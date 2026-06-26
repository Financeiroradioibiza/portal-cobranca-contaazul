"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WaveformBars } from "@/components/criacao/waveform/WaveformBars";

export type DuplicataCompareData = {
  itemId: string;
  arquivoNome: string;
  uploadPreviewUrl: string | null;
  existente: {
    id: string;
    titulo: string;
    artista: string;
    durationMs: number | null;
    previewUrl: string | null;
  } | null;
};

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function CompareTrack({
  label,
  subtitle,
  previewUrl,
  accentClass,
}: {
  label: string;
  subtitle: string;
  previewUrl: string | null;
  accentClass: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setCur(0);
    setDur(0);
  }, [previewUrl]);

  const pct = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;

  const seekTo = useCallback(
    (ratio: number, autoplay = false) => {
      const t = ratio * dur;
      setCur(t);
      const a = audioRef.current;
      if (!a) return;
      a.currentTime = t;
      if (autoplay && previewUrl) {
        void a.play().then(
          () => setPlaying(true),
          () => setPlaying(false),
        );
      }
    },
    [dur, previewUrl],
  );

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a || !previewUrl) return;
    if (playing) {
      a.pause();
      return;
    }
    void a.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  }, [playing, previewUrl]);

  return (
    <div className={"rounded-lg border p-3 " + accentClass}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</div>
          <div className="truncate text-sm font-semibold">{subtitle}</div>
        </div>
        <button
          type="button"
          onClick={togglePlay}
          disabled={!previewUrl}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs text-white disabled:opacity-30 dark:bg-slate-100 dark:text-slate-900"
          title={previewUrl ? "Ouvir" : "Áudio indisponível"}
        >
          {playing ? "⏸" : "▶"}
        </button>
      </div>

      <audio
        ref={audioRef}
        src={previewUrl ?? undefined}
        crossOrigin="anonymous"
        onLoadedMetadata={() => {
          const a = audioRef.current;
          if (a) setDur(a.duration || 0);
        }}
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (a) setCur(a.currentTime);
        }}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onError={() => setPlaying(false)}
        className="hidden"
      />

      {previewUrl ?
        <>
          <WaveformBars
            previewUrl={previewUrl}
            height={56}
            barCount={140}
            interactive
            playheadPct={pct}
            onSeek={(ratio) => seekTo(ratio, true)}
            className="w-full"
          />
          <div className="mt-1 text-[10px] opacity-70">
            {fmt(cur)} / {fmt(dur || 0)} — clique na waveform para posicionar
          </div>
        </>
      : <p className="text-xs opacity-70">Preview indisponível (arquivo ainda não acessível).</p>}
    </div>
  );
}

export function DuplicataComparePanel({
  compare,
  onResolve,
  resolving,
}: {
  compare: DuplicataCompareData;
  onResolve: (decision: "nova" | "existente") => void;
  resolving: boolean;
}) {
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-amber-300 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
      <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">
        Comparação visual — clique nas waveforms para ouvir cada faixa
      </div>

      <CompareTrack
        label="Upload novo"
        subtitle={compare.arquivoNome}
        previewUrl={compare.uploadPreviewUrl}
        accentClass="border-sky-200 bg-sky-50/80 dark:border-sky-900 dark:bg-sky-950/30"
      />

      <CompareTrack
        label="Já no acervo"
        subtitle={
          compare.existente ?
            `${compare.existente.titulo}${compare.existente.artista ? ` — ${compare.existente.artista}` : ""}`
          : "Faixa anterior não encontrada"
        }
        previewUrl={compare.existente?.previewUrl ?? null}
        accentClass="border-violet-200 bg-violet-50/80 dark:border-violet-900 dark:bg-violet-950/30"
      />

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          disabled={resolving}
          onClick={() => onResolve("nova")}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          Manter como nova
        </button>
        <button
          type="button"
          disabled={resolving}
          onClick={() => onResolve("existente")}
          className="rounded-lg border border-slate-400 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300"
        >
          É a mesma (descartar)
        </button>
      </div>
    </div>
  );
}
