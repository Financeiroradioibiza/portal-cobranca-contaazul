"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { WaveformBars } from "@/components/criacao/waveform/WaveformBars";

export type MusicaPreviewTrack = {
  id: string;
  titulo: string;
  artista: string;
  previewUrl: string | null;
  durationMs: number | null;
};

type MusicaPreviewContextValue = {
  track: MusicaPreviewTrack | null;
  playing: boolean;
  openTrack: (track: MusicaPreviewTrack) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  close: () => void;
  isActive: (id: string) => boolean;
};

const MusicaPreviewContext = createContext<MusicaPreviewContextValue | null>(null);

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MusicaPreviewProvider({ children }: { children: ReactNode }) {
  const [track, setTrack] = useState<MusicaPreviewTrack | null>(null);
  const [playing, setPlaying] = useState(false);

  const openTrack = useCallback((next: MusicaPreviewTrack) => {
    setTrack((prev) => {
      if (prev?.id === next.id) {
        setPlaying(true);
        return prev;
      }
      setPlaying(true);
      return next;
    });
  }, []);

  const togglePlay = useCallback(() => {
    setPlaying((p) => !p);
  }, []);

  const pause = useCallback(() => setPlaying(false), []);
  const resume = useCallback(() => setPlaying(true), []);

  const close = useCallback(() => {
    setPlaying(false);
    setTrack(null);
  }, []);

  const isActive = useCallback((id: string) => track?.id === id, [track?.id]);

  const value = useMemo(
    () => ({ track, playing, openTrack, togglePlay, pause, resume, close, isActive }),
    [track, playing, openTrack, togglePlay, pause, resume, close, isActive],
  );

  return (
    <MusicaPreviewContext.Provider value={value}>
      {children}
      <MusicaPreviewDockInner />
    </MusicaPreviewContext.Provider>
  );
}

export function useMusicaPreview(): MusicaPreviewContextValue {
  const ctx = useContext(MusicaPreviewContext);
  if (!ctx) throw new Error("useMusicaPreview must be used within MusicaPreviewProvider");
  return ctx;
}

export function useMusicaPreviewOptional(): MusicaPreviewContextValue | null {
  return useContext(MusicaPreviewContext);
}

/** Botão ▶/⏸ reutilizável nas listas de faixas. */
export function MusicaPreviewButton({
  track,
  className = "",
}: {
  track: MusicaPreviewTrack;
  className?: string;
}) {
  const { isActive, playing, openTrack, togglePlay } = useMusicaPreview();
  const active = isActive(track.id);
  const canPlay = !!track.previewUrl;

  return (
    <button
      type="button"
      disabled={!canPlay}
      onClick={() => {
        if (!canPlay) return;
        if (active) togglePlay();
        else openTrack(track);
      }}
      className={
        "flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs disabled:opacity-30 " +
        (active && playing ?
          "bg-emerald-600 text-white"
        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300") +
        " " +
        className
      }
      title={canPlay ? (active && playing ? "Pausar" : "Ouvir preview") : "Sem áudio"}
    >
      {active && playing ? "⏸" : "▶"}
    </button>
  );
}

function MusicaPreviewDockInner() {
  const { track, playing, togglePlay, pause, resume, close } = useMusicaPreview();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [cur, setCur] = useState(0);
  const [regionStart, setRegionStart] = useState(0);
  const [regionEnd, setRegionEnd] = useState(0);
  const [audioDur, setAudioDur] = useState(0);

  const metaDur = (track?.durationMs ?? 0) / 1000;
  const durSec = audioDur > 0 ? audioDur : metaDur;

  useEffect(() => {
    setCur(0);
    setRegionStart(0);
    setRegionEnd(durSec > 0 ? durSec : 0);
    setAudioDur(0);
  }, [track?.id]);

  useEffect(() => {
    if (regionEnd <= 0 && durSec > 0) setRegionEnd(durSec);
  }, [durSec, regionEnd]);

  const pct = useCallback(
    (v: number) => (durSec > 0 ? Math.min(100, Math.max(0, (v / durSec) * 100)) : 0),
    [durSec],
  );

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !track?.previewUrl) return;
    if (a.src !== track.previewUrl) {
      a.src = track.previewUrl;
      a.load();
    }
    if (playing) {
      if (a.currentTime < regionStart || a.currentTime >= regionEnd) {
        a.currentTime = regionStart;
      }
      void a.play().catch(() => null);
    } else {
      a.pause();
    }
  }, [playing, track?.previewUrl, regionStart, regionEnd, track?.id]);

  const seekTo = useCallback(
    (ratio: number, autoplay = false) => {
      const raw = ratio * durSec;
      const t = Math.min(Math.max(raw, regionStart), Math.max(regionStart, regionEnd - 0.05));
      setCur(t);
      const a = audioRef.current;
      if (!a) return;
      a.currentTime = t;
      if (autoplay && track?.previewUrl) {
        resume();
        void a.play().catch(() => pause());
      }
    },
    [durSec, regionStart, regionEnd, track?.previewUrl, resume, pause],
  );

  function onTimeUpdate() {
    const a = audioRef.current;
    if (!a) return;
    const t = a.currentTime;
    setCur(t);
    if (t >= regionEnd - 0.02) {
      a.pause();
      a.currentTime = regionStart;
      setCur(regionStart);
      pause();
    }
  }

  function onLoadedMetadata() {
    const a = audioRef.current;
    if (!a || !Number.isFinite(a.duration)) return;
    setAudioDur(a.duration);
    setRegionEnd(a.duration);
  }

  if (!track) return null;

  const overlays = [
    ...(regionStart > 0 ?
      [{ leftPct: 0, widthPct: pct(regionStart), color: "rgba(100,116,139,0.45)", label: "Fora do trecho" }]
    : []),
    ...(regionEnd < durSec ?
      [{
        leftPct: pct(regionEnd),
        widthPct: 100 - pct(regionEnd),
        color: "rgba(100,116,139,0.45)",
        label: "Fora do trecho",
      }]
    : []),
    {
      leftPct: pct(regionStart),
      widthPct: Math.max(0, pct(regionEnd) - pct(regionStart)),
      color: "rgba(56,189,248,0.12)",
      label: "Trecho selecionado",
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-700 bg-slate-950/95 shadow-[0_-8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md">
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={() => {
          const a = audioRef.current;
          if (a) a.currentTime = regionStart;
          setCur(regionStart);
          pause();
        }}
        className="hidden"
      />
      <div className="mx-auto max-w-[1500px] px-3 py-2.5 sm:px-4">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!track.previewUrl}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            {playing ? "⏸" : "▶"}
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{track.titulo || "(sem título)"}</div>
            <div className="truncate text-[11px] text-slate-400">{track.artista || "—"} · menor qualidade disponível</div>
          </div>
          <div className="text-[10px] tabular-nums text-slate-400">
            {fmt(cur)} / {fmt(durSec)}
          </div>
          <button type="button" onClick={close} className="text-[10px] text-slate-500 hover:text-slate-300">
            ✕
          </button>
        </div>
        <p className="mb-1 text-[9px] text-slate-500">
          Clique na forma de onda para posicionar · arraste as linhas ciano para delimitar o trecho
        </p>
        <WaveformBars
          previewUrl={track.previewUrl}
          height={56}
          barCount={140}
          interactive
          playheadPct={pct(cur)}
          overlays={overlays}
          regionSelect={
            durSec > 0 ?
              {
                durationSec: durSec,
                startSec: regionStart,
                endSec: regionEnd,
                onStart: (s) => setRegionStart(Math.min(s, regionEnd - 0.1)),
                onEnd: (e) => setRegionEnd(Math.max(e, regionStart + 0.1)),
              }
            : undefined
          }
          onSeek={(ratio) => seekTo(ratio, true)}
          barColor="rgba(255,255,255,0.82)"
          dimColor="rgba(255,255,255,0.1)"
        />
        <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
          <span>
            Trecho: {fmt(regionStart)} – {fmt(regionEnd)}
          </span>
          <button
            type="button"
            className="text-sky-400 hover:text-sky-300"
            onClick={() => {
              setRegionStart(0);
              setRegionEnd(durSec);
              setCur(0);
              if (audioRef.current) audioRef.current.currentTime = 0;
            }}
          >
            Trecho completo
          </button>
        </div>
      </div>
    </div>
  );
}
