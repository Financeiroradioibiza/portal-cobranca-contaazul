"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getWaveformPeaks } from "./peaksCache";

export type WaveformOverlay = {
  /** 0–100 */
  leftPct: number;
  widthPct: number;
  color: string;
  label?: string;
};

type WaveformBarsProps = {
  previewUrl: string | null;
  barCount?: number;
  height?: number;
  className?: string;
  /** Clique na waveform — retorna posição 0–1 */
  interactive?: boolean;
  onSeek?: (ratio: number) => void;
  /** Posição do playhead 0–100 */
  playheadPct?: number;
  overlays?: WaveformOverlay[];
  barColor?: string;
  dimColor?: string;
};

export function WaveformBars({
  previewUrl,
  barCount = 100,
  height = 40,
  className = "",
  interactive = false,
  onSeek,
  playheadPct,
  overlays = [],
  barColor = "rgba(255,255,255,0.85)",
  dimColor = "rgba(255,255,255,0.12)",
}: WaveformBarsProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!previewUrl) {
      setPeaks(null);
      setErr(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(false);
    void getWaveformPeaks(previewUrl, barCount)
      .then((p) => {
        if (!cancelled) setPeaks(p);
      })
      .catch(() => {
        if (!cancelled) setErr(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [previewUrl, barCount]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const w = wrap.clientWidth;
    const h = height;
    if (w <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const mid = h / 2;
    const data = peaks ?? [];
    const maxPeak = Math.max(...data, 0.001);
    const gap = 1;
    const barW = data.length ? (w - gap * (data.length - 1)) / data.length : 0;

    for (let i = 0; i < data.length; i++) {
      const amp = (data[i]! / maxPeak) * (h * 0.92);
      const x = i * (barW + gap);
      ctx.fillStyle = barColor;
      ctx.fillRect(x, mid - amp / 2, Math.max(1, barW), Math.max(1, amp));
    }

    if (!data.length && !loading) {
      ctx.fillStyle = dimColor;
      ctx.fillRect(0, mid - 1, w, 2);
    }
  }, [peaks, height, barColor, dimColor, loading]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  function handlePointer(e: React.MouseEvent | React.TouchEvent) {
    if (!interactive || !onSeek || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX : e.clientX;
    if (clientX == null) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(ratio);
  }

  return (
    <div
      ref={wrapRef}
      className={
        "relative overflow-hidden rounded-md bg-slate-950 " +
        (interactive ? "cursor-crosshair " : "") +
        className
      }
      style={{ height }}
      onClick={interactive ? handlePointer : undefined}
      onTouchStart={interactive ? handlePointer : undefined}
      role={interactive ? "slider" : undefined}
      aria-label={interactive ? "Posição de reprodução" : "Forma de onda"}
    >
      <canvas ref={canvasRef} className="block w-full" />
      {loading ?
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/60 text-[9px] text-slate-400">
          …
        </div>
      : null}
      {err && !loading ?
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] text-slate-500">
          sem áudio
        </div>
      : null}
      {overlays.map((o, i) => (
        <div
          key={i}
          className="pointer-events-none absolute inset-y-0"
          style={{ left: `${o.leftPct}%`, width: `${o.widthPct}%`, background: o.color }}
          title={o.label}
        />
      ))}
      {playheadPct != null ?
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]"
          style={{ left: `${playheadPct}%` }}
        />
      : null}
    </div>
  );
}

/** Só carrega waveform quando o elemento entra na viewport. */
export function LazyWaveformBars(props: WaveformBarsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="min-w-0 flex-1">
      {visible ?
        <WaveformBars {...props} />
      : <div className="rounded-md bg-slate-900" style={{ height: props.height ?? 40 }} />}
    </div>
  );
}
