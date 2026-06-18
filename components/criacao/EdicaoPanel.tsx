"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { TAG_SOURCE_LABEL } from "@/lib/criacao/bibliotecaService";
import { LazyWaveformBars, WaveformBars } from "@/components/criacao/waveform/WaveformBars";

type AutoTag = { fonte: string; chave?: string; valor: string };
type ManualTag = { id: string; nome: string; cor: string; criativoIniciais: string; criativoNome: string };

type Faixa = {
  id: string;
  titulo: string;
  artista: string;
  durationMs: number | null;
  loudnessLufs: number | null;
  mixSegundosFinais: number | null;
  mixAuto: boolean;
  trimInicioMs: number;
  trimFimMs: number;
  previewUrl: string | null;
  tagsManuais: ManualTag[];
  tagsAuto: AutoTag[];
};

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function readableText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1e293b" : "#ffffff";
}

function TagChips({ faixa, max = 6 }: { faixa: Faixa; max?: number }) {
  const all = [
    ...faixa.tagsManuais.map((t) => ({
      key: t.id,
      label: `${t.criativoIniciais ? `[${t.criativoIniciais}] ` : ""}${t.nome}`,
      style: { background: t.cor, color: readableText(t.cor) } as CSSProperties,
      title: t.criativoNome,
    })),
    ...faixa.tagsAuto.slice(0, 4).map((t, i) => ({
      key: `${t.fonte}-${i}`,
      label: `[${TAG_SOURCE_LABEL[t.fonte] ?? t.fonte.slice(0, 2).toUpperCase()}] ${t.valor}`,
      style: undefined,
      title: undefined,
    })),
  ];
  const shown = all.slice(0, max);
  const extra = all.length - shown.length;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {shown.map((t) =>
        t.style ?
          <span
            key={t.key}
            className="inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold"
            style={t.style}
            title={t.title}
          >
            {t.label}
          </span>
        : <span
            key={t.key}
            className="inline-flex rounded border border-slate-700 bg-slate-800/80 px-1.5 py-0.5 text-[9px] text-slate-300"
          >
            {t.label}
          </span>,
      )}
      {extra > 0 ?
        <span className="text-[9px] text-slate-500">+ {extra}</span>
      : null}
    </div>
  );
}

export function EdicaoPanel() {
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [sel, setSel] = useState<Faixa | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      const res = await fetch(`/api/criacao/edicao${qs}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { faixas: Faixa[] };
      setFaixas(data.faixas);
      setSel((prev) => (prev ? data.faixas.find((f) => f.id === prev.id) ?? null : null));
    } catch {
      setError("Não foi possível carregar as faixas.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-6 sm:px-4">
      <div className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Criação / Edição de música</div>
        <h1 className="text-2xl font-bold tracking-tight">Edição de música</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Veja a <strong>forma de onda</strong> de cada faixa — silêncio no início ou fim aparece como espaço vazio.
          Clique numa faixa para ajustar mix/trim; no editor, <strong>clique na waveform</strong> para tocar a partir daquele ponto.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(draft);
        }}
        className="mb-4 flex gap-2"
      >
        <input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Buscar faixa por título ou artista…"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
          Buscar
        </button>
      </form>

      {loading ?
        <div className="py-10 text-sm text-slate-500">Carregando faixas e waveforms…</div>
      : error ?
        <div className="py-10 text-sm text-red-600">{error}</div>
      : faixas.length === 0 ?
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
          Nenhuma faixa pronta. Processe uploads primeiro.
        </div>
      : <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 shadow-sm dark:border-slate-800">
            <div className="hidden border-b border-slate-800 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[minmax(180px,1fr)_minmax(0,2fr)_minmax(220px,1.2fr)] md:gap-4">
              <span>Forma de onda</span>
              <span />
              <span>Faixa · tags</span>
            </div>
            <ul className="divide-y divide-slate-800">
              {faixas.map((f) => {
                const active = sel?.id === f.id;
                const hasTrim = f.trimInicioMs > 0 || f.trimFimMs > 0;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => setSel(f)}
                      className={
                        "grid w-full grid-cols-1 gap-3 px-3 py-3 text-left transition md:grid-cols-[minmax(180px,1fr)_minmax(0,2fr)_minmax(220px,1.2fr)] md:items-center md:gap-4 md:px-4 " +
                        (active ? "bg-slate-800/80 ring-1 ring-inset ring-amber-500/40" : "hover:bg-slate-900/60")
                      }
                    >
                      <LazyWaveformBars previewUrl={f.previewUrl} height={44} barCount={90} barColor="rgba(255,255,255,0.7)" />
                      <div className="hidden md:block" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-100">{f.titulo || "(sem título)"}</div>
                        <div className="truncate text-xs text-slate-400">
                          {f.artista || "—"}
                          {f.durationMs ? ` · ${fmt(f.durationMs / 1000)}` : ""}
                          {f.mixSegundosFinais != null ? ` · mix ${f.mixSegundosFinais}s` : ""}
                          {hasTrim ? " · trim ✂" : ""}
                        </div>
                        <TagChips faixa={f} max={5} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {sel ?
            <div className="mt-4">
              <FaixaEditor
                key={sel.id}
                faixa={sel}
                onClose={() => setSel(null)}
                onSaved={(updated) => {
                  setFaixas((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                  setSel(updated);
                }}
              />
            </div>
          : null}
        </>
      }
    </div>
  );
}

function FaixaEditor({
  faixa,
  onSaved,
  onClose,
}: {
  faixa: Faixa;
  onSaved: (f: Faixa) => void;
  onClose: () => void;
}) {
  const durSec = (faixa.durationMs ?? 0) / 1000;
  const [mix, setMix] = useState<number>(faixa.mixSegundosFinais ?? 0);
  const [trimIni, setTrimIni] = useState<number>(faixa.trimInicioMs / 1000);
  const [trimFim, setTrimFim] = useState<number>(faixa.trimFimMs / 1000);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [seekSec, setSeekSec] = useState(0);
  const [cur, setCur] = useState(0);

  const efetivoInicio = Math.min(trimIni, Math.max(0, durSec - 0.1));
  const efetivoFim = Math.max(efetivoInicio + 0.1, durSec - trimFim);
  const pct = (v: number) => (durSec > 0 ? Math.min(100, Math.max(0, (v / durSec) * 100)) : 0);

  useEffect(() => {
    setMix(faixa.mixSegundosFinais ?? 0);
    setTrimIni(faixa.trimInicioMs / 1000);
    setTrimFim(faixa.trimFimMs / 1000);
    setSeekSec(0);
    setCur(0);
    setPlaying(false);
  }, [faixa.id, faixa.mixSegundosFinais, faixa.trimInicioMs, faixa.trimFimMs]);

  const seekTo = useCallback(
    (ratio: number, autoplay = false) => {
      const t = ratio * durSec;
      setSeekSec(t);
      setCur(t);
      const a = audioRef.current;
      if (!a) return;
      a.currentTime = t;
      if (autoplay && faixa.previewUrl) {
        void a.play().then(
          () => setPlaying(true),
          () => setPlaying(false),
        );
      }
    },
    [durSec, faixa.previewUrl],
  );

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a || !faixa.previewUrl) return;
    if (playing) {
      a.pause();
      return;
    }
    a.currentTime = seekSec;
    void a.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  }, [playing, seekSec, faixa.previewUrl]);

  function onTime() {
    const a = audioRef.current;
    if (!a) return;
    setCur(a.currentTime);
  }

  async function save() {
    setSaving(true);
    setSavedMsg(null);
    try {
      const res = await fetch(`/api/criacao/musicas/${faixa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mixSegundosFinais: Math.round(mix),
          trimInicioMs: Math.round(trimIni * 1000),
          trimFimMs: Math.round(trimFim * 1000),
        }),
      });
      if (!res.ok) throw new Error();
      onSaved({
        ...faixa,
        mixSegundosFinais: Math.round(mix),
        mixAuto: false,
        trimInicioMs: Math.round(trimIni * 1000),
        trimFimMs: Math.round(trimFim * 1000),
      });
      setSavedMsg("Salvo ✓");
      setTimeout(() => setSavedMsg(null), 2000);
    } catch {
      setSavedMsg("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const overlays = [
    { leftPct: 0, widthPct: pct(efetivoInicio), color: "rgba(100,116,139,0.55)", label: "Corte início" },
    { leftPct: pct(efetivoFim), widthPct: 100 - pct(efetivoFim), color: "rgba(100,116,139,0.55)", label: "Corte fim" },
    ...(mix > 0 ?
      [{
        leftPct: pct(Math.max(efetivoInicio, efetivoFim - mix)),
        widthPct: pct(Math.min(mix, efetivoFim - efetivoInicio)),
        color: "rgba(52,211,153,0.35)",
        label: "Ponto de mix",
      }]
    : []),
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-bold">{faixa.titulo || "(sem título)"}</div>
          <div className="text-sm text-slate-500">
            {faixa.artista || "—"} · {fmt(durSec)}
            {faixa.loudnessLufs != null ? ` · ${faixa.loudnessLufs.toFixed(1)} LUFS` : ""}
          </div>
          <TagChips faixa={faixa} max={8} />
        </div>
        <button type="button" onClick={onClose} className="text-sm text-slate-400 hover:text-slate-600">
          Fechar ✕
        </button>
      </div>

      <audio
        ref={audioRef}
        src={faixa.previewUrl ?? undefined}
        crossOrigin="anonymous"
        onTimeUpdate={onTime}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onError={() => setPlaying(false)}
        className="hidden"
      />

      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Clique na waveform para posicionar o play · cinza = será cortado · verde = cauda do mix
      </div>
      <WaveformBars
        previewUrl={faixa.previewUrl}
        height={72}
        barCount={140}
        interactive
        playheadPct={pct(cur)}
        overlays={overlays}
        onSeek={(ratio) => seekTo(ratio, true)}
        className="mb-2"
      />
      <div className="mb-4 flex items-center justify-between text-[10px] text-slate-400">
        <span>{fmt(cur)}</span>
        <span>trecho útil: {fmt(efetivoInicio)} – {fmt(efetivoFim)}</span>
        <span>{fmt(durSec)}</span>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!faixa.previewUrl}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-30 dark:bg-slate-100 dark:text-slate-900"
        >
          {playing ? "⏸" : "▶"}
        </button>
        <span className="text-xs text-slate-500">
          {faixa.previewUrl ?
            `Toca a partir de ${fmt(seekSec)} — clique na waveform para mudar`
          : "Sem versão de uso para tocar"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Ponto de mix (segundos finais)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={30}
              value={mix}
              onChange={(e) => setMix(Number(e.target.value))}
              className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <input type="range" min={0} max={30} value={mix} onChange={(e) => setMix(Number(e.target.value))} className="flex-1" />
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            {faixa.mixAuto ? "Detectado automaticamente — editar marca como manual." : "Ajustado manualmente."}
          </div>
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Cortar do início (s)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={trimIni}
            onChange={(e) => setTrimIni(Math.max(0, Number(e.target.value)))}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Cortar do fim (s)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={trimFim}
            onChange={(e) => setTrimFim(Math.max(0, Number(e.target.value)))}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          {saving ? "Salvando…" : "Salvar ajustes"}
        </button>
        {savedMsg ? <span className="text-sm text-emerald-600">{savedMsg}</span> : null}
      </div>
    </div>
  );
}
