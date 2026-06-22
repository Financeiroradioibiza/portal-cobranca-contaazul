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

export type WaveformTrimEdit = {
  durationSec: number;
  trimStartSec: number;
  trimEndSec: number;
  mixSec: number;
  onTrimStart: (sec: number) => void;
  onTrimEnd: (sec: number) => void;
  onMix?: (sec: number) => void;
};

export type WaveformRegionSelect = {
  durationSec: number;
  startSec: number;
  endSec: number;
  onStart: (sec: number) => void;
  onEnd: (sec: number) => void;
};

type WaveformBarsProps = {
  previewUrl: string | null;
  barCount?: number;
  height?: number;
  className?: string;
  /** Clique na waveform — retorna posição 0–1 */
  interactive?: boolean;
  onSeek?: (ratio: number) => void;
  /** Arrastar handles de trim / mix na waveform */
  trimEdit?: WaveformTrimEdit;
  /** Seleção de trecho para preview (handles ciano) */
  regionSelect?: WaveformRegionSelect;
  /** Posição do playhead 0–100 */
  playheadPct?: number;
  overlays?: WaveformOverlay[];
  barColor?: string;
  dimColor?: string;
};

type DragMode = "trim-start" | "trim-end" | "mix" | "region-start" | "region-end" | null;

function pctFromSec(sec: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.min(100, Math.max(0, (sec / durationSec) * 100));
}

export function WaveformBars({
  previewUrl,
  barCount = 100,
  height = 40,
  className = "",
  interactive = false,
  onSeek,
  trimEdit,
  regionSelect,
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
  const dragRef = useRef<DragMode>(null);

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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  const ratioFromClientX = useCallback((clientX: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return 0;
    const rect = wrap.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const hitTrimHandle = useCallback(
    (clientX: number): DragMode => {
      const wrap = wrapRef.current;
      if (!wrap) return null;
      const rect = wrap.getBoundingClientRect();
      const x = clientX - rect.left;
      const hit = Math.max(14, rect.width * 0.015);

      if (regionSelect && regionSelect.durationSec > 0) {
        const startX = (regionSelect.startSec / regionSelect.durationSec) * rect.width;
        const endX = (regionSelect.endSec / regionSelect.durationSec) * rect.width;
        if (Math.abs(x - startX) <= hit) return "region-start";
        if (Math.abs(x - endX) <= hit) return "region-end";
      }

      if (!trimEdit || trimEdit.durationSec <= 0) return null;

      const startX = (trimEdit.trimStartSec / trimEdit.durationSec) * rect.width;
      const endX = ((trimEdit.durationSec - trimEdit.trimEndSec) / trimEdit.durationSec) * rect.width;

      if (Math.abs(x - startX) <= hit) return "trim-start";
      if (Math.abs(x - endX) <= hit) return "trim-end";

      if (trimEdit.mixSec > 0 && trimEdit.onMix) {
        const mixStartSec = Math.max(
          trimEdit.trimStartSec,
          trimEdit.durationSec - trimEdit.trimEndSec - trimEdit.mixSec,
        );
        const mixX = (mixStartSec / trimEdit.durationSec) * rect.width;
        if (Math.abs(x - mixX) <= hit) return "mix";
      }
      return null;
    },
    [trimEdit, regionSelect],
  );

  const applyDrag = useCallback(
    (mode: DragMode, ratio: number) => {
      if (!mode) return;
      if (mode === "region-start" || mode === "region-end") {
        if (!regionSelect) return;
        const d = regionSelect.durationSec;
        const t = ratio * d;
        if (mode === "region-start") {
          regionSelect.onStart(Math.min(Math.max(0, t), regionSelect.endSec - 0.1));
        } else {
          regionSelect.onEnd(Math.max(Math.min(d, t), regionSelect.startSec + 0.1));
        }
        return;
      }
      if (!trimEdit) return;
      const d = trimEdit.durationSec;
      const t = ratio * d;
      const endSec = d - trimEdit.trimEndSec;

      if (mode === "trim-start") {
        const next = Math.min(Math.max(0, t), endSec - 0.1);
        trimEdit.onTrimStart(next);
      } else if (mode === "trim-end") {
        const cutFromEnd = Math.max(0, d - t);
        const next = Math.min(Math.max(0, cutFromEnd), d - trimEdit.trimStartSec - 0.1);
        trimEdit.onTrimEnd(next);
      } else if (mode === "mix" && trimEdit.onMix) {
        const useful = endSec - trimEdit.trimStartSec;
        const mixStart = Math.max(trimEdit.trimStartSec, Math.min(t, endSec - 0.1));
        const mix = Math.max(0, Math.min(30, endSec - mixStart));
        trimEdit.onMix(Math.round(mix));
      }
    },
    [trimEdit, regionSelect],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      applyDrag(dragRef.current, ratioFromClientX(e.clientX));
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [applyDrag, ratioFromClientX]);

  function handlePointerDown(e: React.PointerEvent) {
    if (!interactive || !wrapRef.current) return;
    const mode = hitTrimHandle(e.clientX);
    if (mode) {
      e.preventDefault();
      dragRef.current = mode;
      return;
    }
    if (onSeek) {
      onSeek(ratioFromClientX(e.clientX));
    }
  }

  const trimStartPct = trimEdit ? pctFromSec(trimEdit.trimStartSec, trimEdit.durationSec) : null;
  const trimEndPct =
    trimEdit ? 100 - pctFromSec(trimEdit.trimEndSec, trimEdit.durationSec) : null;
  const mixStartPct =
    trimEdit && trimEdit.mixSec > 0 ?
      pctFromSec(
        Math.max(trimEdit.trimStartSec, trimEdit.durationSec - trimEdit.trimEndSec - trimEdit.mixSec),
        trimEdit.durationSec,
      )
    : null;
  const regionStartPct =
    regionSelect ? pctFromSec(regionSelect.startSec, regionSelect.durationSec) : null;
  const regionEndPct = regionSelect ? pctFromSec(regionSelect.endSec, regionSelect.durationSec) : null;

  return (
    <div
      ref={wrapRef}
      className={
        "relative w-full min-w-0 overflow-hidden rounded-md bg-slate-950 " +
        (interactive ? "cursor-crosshair touch-none " : "") +
        className
      }
      style={{ height }}
      onPointerDown={interactive ? handlePointerDown : undefined}
      role={interactive ? "group" : undefined}
      aria-label={interactive ? "Forma de onda — arraste as bordas cinza para trim" : "Forma de onda"}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
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
      {trimStartPct != null ?
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-1 -translate-x-1/2 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]"
          style={{ left: `${trimStartPct}%` }}
          title="Arraste para cortar início"
        />
      : null}
      {trimEndPct != null ?
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-1 -translate-x-1/2 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]"
          style={{ left: `${trimEndPct}%` }}
          title="Arraste para cortar fim"
        />
      : null}
      {mixStartPct != null ?
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 border-l-2 border-dashed border-emerald-400"
          style={{ left: `${mixStartPct}%` }}
          title="Início do ponto de mix"
        />
      : null}
      {regionStartPct != null ?
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-1 -translate-x-1/2 bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)]"
          style={{ left: `${regionStartPct}%` }}
          title="Início do trecho"
        />
      : null}
      {regionEndPct != null ?
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-1 -translate-x-1/2 bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)]"
          style={{ left: `${regionEndPct}%` }}
          title="Fim do trecho"
        />
      : null}
      {playheadPct != null ?
        <div
          className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.9)]"
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
    <div ref={ref} className="min-w-0 w-full">
      {visible ?
        <WaveformBars {...props} />
      : <div className="w-full rounded-md bg-slate-900" style={{ height: props.height ?? 40 }} />}
    </div>
  );
}
