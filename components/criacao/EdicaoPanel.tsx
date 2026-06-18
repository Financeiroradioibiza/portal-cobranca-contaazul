"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
};

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
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
    <div className="mx-auto max-w-[1300px] px-3 py-6 sm:px-4">
      <div className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Criação / Edição de música</div>
        <h1 className="text-2xl font-bold tracking-tight">Edição de música</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          O “tapa” nas faixas já processadas: ajuste o <strong>ponto de mix</strong> (segundos finais do
          crossfade) e o <strong>trim</strong> (cortar início/fim). É a faixa canônica — vale para todos os
          clientes que a tocam. O corte é aplicado na entrega.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(draft);
            }}
            className="mb-3 flex gap-2"
          >
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Buscar faixa por título ou artista…"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              Buscar
            </button>
          </form>

          {loading ?
            <div className="py-8 text-sm text-slate-500">Carregando…</div>
          : error ?
            <div className="py-8 text-sm text-red-600">{error}</div>
          : faixas.length === 0 ?
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
              Nenhuma faixa pronta. Processe uploads primeiro.
            </div>
          : <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {faixas.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setSel(f)}
                    className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm ${
                      sel?.id === f.id ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800 dark:text-slate-100">{f.titulo || "(sem título)"}</div>
                      <div className="truncate text-xs text-slate-500">{f.artista || "—"}</div>
                    </div>
                    <div className="shrink-0 text-right text-[10px] text-slate-400">
                      <div>mix {f.mixSegundosFinais ?? "—"}s {f.mixAuto ? "(auto)" : "(manual)"}</div>
                      {f.trimInicioMs || f.trimFimMs ? <div>trim ✂</div> : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          }
        </div>

        <div>
          {sel ?
            <FaixaEditor
              key={sel.id}
              faixa={sel}
              onSaved={(updated) => {
                setFaixas((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                setSel(updated);
              }}
            />
          : <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400 dark:border-slate-700">
              Selecione uma faixa para editar
            </div>
          }
        </div>
      </div>
    </div>
  );
}

function FaixaEditor({ faixa, onSaved }: { faixa: Faixa; onSaved: (f: Faixa) => void }) {
  const durSec = (faixa.durationMs ?? 0) / 1000;
  const [mix, setMix] = useState<number>(faixa.mixSegundosFinais ?? 0);
  const [trimIni, setTrimIni] = useState<number>(faixa.trimInicioMs / 1000);
  const [trimFim, setTrimFim] = useState<number>(faixa.trimFimMs / 1000);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);

  const efetivoInicio = Math.min(trimIni, Math.max(0, durSec - 0.1));
  const efetivoFim = Math.max(efetivoInicio + 0.1, durSec - trimFim);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a || !faixa.previewUrl) return;
    if (playing) {
      a.pause();
      return;
    }
    a.currentTime = efetivoInicio;
    a.play().then(() => setPlaying(true), () => setPlaying(false));
  }, [playing, efetivoInicio, faixa.previewUrl]);

  function onTime() {
    const a = audioRef.current;
    if (!a) return;
    setCur(a.currentTime);
    if (a.currentTime >= efetivoFim) {
      a.pause();
      a.currentTime = efetivoInicio;
    }
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

  const pct = (v: number) => (durSec > 0 ? Math.min(100, Math.max(0, (v / durSec) * 100)) : 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-1 text-lg font-bold">{faixa.titulo || "(sem título)"}</div>
      <div className="mb-4 text-sm text-slate-500">
        {faixa.artista || "—"} · {fmt(durSec)}
        {faixa.loudnessLufs != null ? ` · ${faixa.loudnessLufs.toFixed(1)} LUFS` : ""}
      </div>

      <audio ref={audioRef} src={faixa.previewUrl ?? undefined} crossOrigin="anonymous" onTimeUpdate={onTime} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} onError={() => setPlaying(false)} className="hidden" />

      {/* Régua visual: trim (cinza), trecho útil (branco), cauda de mix (verde) */}
      <div className="relative mb-2 h-10 w-full overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
        <div className="absolute inset-y-0 left-0 bg-slate-300/70 dark:bg-slate-700" style={{ width: `${pct(efetivoInicio)}%` }} />
        <div className="absolute inset-y-0 right-0 bg-slate-300/70 dark:bg-slate-700" style={{ width: `${pct(trimFim)}%` }} />
        {mix > 0 ?
          <div
            className="absolute inset-y-0 bg-emerald-400/40"
            style={{ left: `${pct(efetivoFim - mix)}%`, width: `${pct(Math.min(mix, efetivoFim - efetivoInicio))}%` }}
            title="Cauda do crossfade (ponto de mix)"
          />
        : null}
        <div className="absolute inset-y-0 w-0.5 bg-slate-900 dark:bg-slate-100" style={{ left: `${pct(cur)}%` }} />
      </div>
      <div className="mb-4 flex items-center justify-between text-[10px] text-slate-400">
        <span>0:00</span>
        <span>trecho útil: {fmt(efetivoInicio)} – {fmt(efetivoFim)}</span>
        <span>{fmt(durSec)}</span>
      </div>

      <div className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!faixa.previewUrl}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-30 dark:bg-slate-100 dark:text-slate-900"
        >
          {playing ? "⏸" : "▶"}
        </button>
        <span className="text-xs text-slate-500">
          {faixa.previewUrl ? "Toca só o trecho útil (com o trim aplicado)" : "Sem versão de uso para tocar"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">
            Ponto de mix (segundos finais)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={30}
              value={mix}
              onChange={(e) => setMix(Number(e.target.value))}
              className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="range"
              min={0}
              max={30}
              value={mix}
              onChange={(e) => setMix(Number(e.target.value))}
              className="flex-1"
            />
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
