"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { TAG_SOURCE_LABEL } from "@/lib/criacao/bibliotecaService";
import { MIX_PADRAO_SEGUNDOS } from "@/lib/criacao/criacaoDefaults";
import { isUploadCompetenciaTag } from "@/lib/criacao/uploadCompetenciaTag";
import { LazyWaveformBars, WaveformBars, WaveformEditBadges } from "@/components/criacao/waveform/WaveformBars";

type AutoTag = { fonte: string; chave?: string; valor: string };
type ManualTag = { id: string; nome: string; cor: string; criativoIniciais: string; criativoNome: string };
type TagChip = { id: string; nome: string; cor: string; criativoNome?: string };

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
  createdAt: string;
  tagsManuais: ManualTag[];
  tagsAuto: AutoTag[];
};

function formatUploadWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
      compact: isUploadCompetenciaTag(t.nome),
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
            className={
              "inline-flex rounded font-bold " +
              ("compact" in t && t.compact ? "px-1 py-0 text-[8px] opacity-90" : "px-1.5 py-0.5 text-[9px]")
            }
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
  const [tagIdFilter, setTagIdFilter] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<TagChip[]>([]);
  const [sel, setSel] = useState<Faixa | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reanalyzing, setReanalyzing] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/criacao/tags")
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((d: { tags?: TagChip[] }) => setAllTags(d.tags ?? []))
      .catch(() => setAllTags([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (tagIdFilter) params.set("tagId", tagIdFilter);
      const qs = params.toString() ? `?${params.toString()}` : "";
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
  }, [search, tagIdFilter]);

  useEffect(() => {
    void load();
    setSelected(new Set());
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(draft), 300);
    return () => clearTimeout(t);
  }, [draft]);

  const allPageSelected = faixas.length > 0 && faixas.every((f) => selected.has(f.id));

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllPage() {
    if (allPageSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(faixas.map((f) => f.id)));
    }
  }

  async function reanalisarSelected() {
    if (selected.size === 0) return;
    if (
      !window.confirm(
        `Detectar mix e trim automaticamente em ${selected.size} faixa(s)? Valores atuais serão substituídos.`,
      )
    ) {
      return;
    }
    setReanalyzing(true);
    setBulkMsg(null);
    try {
      const res = await fetch("/api/criacao/edicao/reanalisar-mix-trim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ musicaIds: [...selected] }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        okCount?: number;
        failCount?: number;
        fallback?: boolean;
        message?: string;
      };
      if (!res.ok) {
        setBulkMsg("Não foi possível reanalisar — tente de novo.");
        return;
      }
      const ok = data.okCount ?? 0;
      const fail = data.failCount ?? 0;
      setBulkMsg(
        data.fallback ?
          "Servidor de áudio indisponível."
        : fail > 0 ?
          `${ok} reanalisada(s), ${fail} sem upload bruto no servidor.`
        : `${ok} faixa(s) reanalisada(s) ✓`,
      );
      await load();
    } catch {
      setBulkMsg("Erro de rede ao reanalisar.");
    } finally {
      setReanalyzing(false);
    }
  }

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
        className="mb-2 flex gap-2"
      >
        <input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Título, artista, tag, mood (calmo, animado…), BPM, pasta ou programação…"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
          Buscar
        </button>
      </form>
      {allTags.length > 0 ?
        <div className="mb-4 max-h-24 overflow-y-auto rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Filtrar por tag
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((t) => {
              const active = tagIdFilter === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTagIdFilter(active ? null : t.id)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                    active ? "ring-2 ring-slate-900 ring-offset-1 dark:ring-white" : "opacity-90 hover:opacity-100"
                  }`}
                  style={{ backgroundColor: t.cor, color: readableText(t.cor) }}
                  title={t.criativoNome ? `[${t.criativoNome}] ${t.nome}` : t.nome}
                >
                  {t.criativoNome ? `[${t.criativoNome}] ` : ""}
                  {t.nome}
                </button>
              );
            })}
            {tagIdFilter ?
              <button
                type="button"
                onClick={() => setTagIdFilter(null)}
                className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-50 dark:border-slate-600"
              >
                Limpar tag
              </button>
            : null}
          </div>
        </div>
      : null}
      <p className="mb-4 text-[11px] text-slate-500">
        Ordenado por <strong>upload mais recente</strong>. Dica: busque pelo nome da pasta ou programação para listar uma playlist inteira.
      </p>

      {faixas.length > 0 ?
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={allPageSelected}
              onChange={toggleSelectAllPage}
              className="rounded border-slate-300"
            />
            Marcar todas da página ({faixas.length})
          </label>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500">{selected.size} selecionada(s)</span>
          <button
            type="button"
            disabled={selected.size === 0 || reanalyzing}
            onClick={() => void reanalisarSelected()}
            className="ml-auto rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-40"
          >
            {reanalyzing ? "Analisando…" : "Detectar mix/trim automaticamente"}
          </button>
          {bulkMsg ?
            <span className="w-full text-xs text-emerald-700 dark:text-emerald-300">{bulkMsg}</span>
          : null}
        </div>
      : null}

      {loading ?
        <div className="py-10 text-sm text-slate-500">Carregando faixas e waveforms…</div>
      : error ?
        <div className="py-10 text-sm text-red-600">{error}</div>
      : faixas.length === 0 ?
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
          Nenhuma faixa pronta. Processe uploads primeiro.
        </div>
      : <>
          <div className={`overflow-hidden rounded-xl border border-slate-200 bg-slate-950 shadow-sm dark:border-slate-800${sel ? " pb-52 md:pb-64" : ""}`}>
            <div className="hidden border-b border-slate-800 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[auto_minmax(0,1fr)_minmax(220px,340px)] md:gap-4">
              <span className="w-6" />
              <span>Forma de onda</span>
              <span>Faixa · tags</span>
            </div>
            <ul className="divide-y divide-slate-800">
              {faixas.map((f) => {
                const active = sel?.id === f.id;
                const checked = selected.has(f.id);
                const hasTrim = f.trimInicioMs > 0 || f.trimFimMs > 0;
                const hasManualMix = !f.mixAuto;
                return (
                  <li key={f.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSel(f)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSel(f);
                        }
                      }}
                      className={
                        "grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-2 px-3 py-3 text-left transition md:grid-cols-[auto_minmax(0,1fr)_minmax(220px,340px)] md:items-center md:gap-4 md:px-4 " +
                        (active ? "bg-slate-800/80 ring-1 ring-inset ring-amber-500/40" : "hover:bg-slate-900/60")
                      }
                    >
                      <div className="flex items-start pt-1 md:items-center md:pt-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleSelected(f.id)}
                          aria-label={`Selecionar ${f.titulo}`}
                          className="rounded border-slate-600 bg-slate-900"
                        />
                      </div>
                      <div className="relative min-w-0">
                        <LazyWaveformBars previewUrl={f.previewUrl} height={44} barCount={120} barColor="rgba(255,255,255,0.7)" />
                        <WaveformEditBadges hasTrim={hasTrim} hasManualMix={hasManualMix} />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-100">{f.titulo || "(sem título)"}</div>
                        <div className="truncate text-xs text-slate-400">
                          {f.artista || "—"}
                          {f.durationMs ? ` · ${fmt(f.durationMs / 1000)}` : ""}
                          {f.mixSegundosFinais != null ? ` · mix ${f.mixSegundosFinais}s` : ""}
                          {hasTrim ? " · trim ✂" : ""}
                          {f.createdAt ? ` · ↑ ${formatUploadWhen(f.createdAt)}` : ""}
                        </div>
                        <TagChips faixa={f} max={5} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {sel ?
            <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-700 bg-slate-950/95 shadow-[0_-8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md">
              <div className="mx-auto max-w-[1400px] px-3 py-3 sm:px-4">
                <FaixaEditor
                  key={sel.id}
                  faixa={sel}
                  docked
                  onClose={() => setSel(null)}
                  onSaved={(updated) => {
                    setFaixas((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                    setSel(updated);
                  }}
                />
              </div>
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
  docked = false,
}: {
  faixa: Faixa;
  onSaved: (f: Faixa) => void;
  onClose: () => void;
  docked?: boolean;
}) {
  const durSec = (faixa.durationMs ?? 0) / 1000;
  const [mix, setMix] = useState<number>(faixa.mixSegundosFinais ?? MIX_PADRAO_SEGUNDOS);
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
    setMix(faixa.mixSegundosFinais ?? MIX_PADRAO_SEGUNDOS);
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
      const data = (await res.json().catch(() => ({}))) as { reprocessOk?: boolean; reprocessError?: string };
      onSaved({
        ...faixa,
        mixSegundosFinais: Math.round(mix),
        mixAuto: false,
        trimInicioMs: Math.round(trimIni * 1000),
        trimFimMs: Math.round(trimFim * 1000),
      });
      if (data.reprocessOk === false) {
        setSavedMsg("Salvo, mas falhou reprocessar áudio — tente de novo");
      } else {
        setSavedMsg(trimIni > 0 || trimFim > 0 ? "Salvo e áudio recortado ✓" : "Salvo ✓");
      }
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
    <div className={docked ? "" : "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"}>
      <div className={`mb-3 flex flex-wrap items-start justify-between gap-3${docked ? " text-white" : ""}`}>
        <div className="min-w-0">
          <div className={`truncate font-bold ${docked ? "text-sm" : "text-lg"}`}>{faixa.titulo || "(sem título)"}</div>
          <div className={`truncate text-xs ${docked ? "text-slate-400" : "text-slate-500"}`}>
            {faixa.artista || "—"} · {fmt(durSec)}
            {faixa.loudnessLufs != null ? ` · ${faixa.loudnessLufs.toFixed(1)} LUFS` : ""}
          </div>
          {!docked ? <TagChips faixa={faixa} max={8} /> : null}
        </div>
        <button type="button" onClick={onClose} className="text-sm text-slate-400 hover:text-slate-200">
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

      <div className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${docked ? "text-slate-500" : "text-slate-500"}`}>
        Clique para posicionar o play · arraste as linhas âmbar para trim · verde = mix · cinza = será cortado
      </div>
      <div className="relative mb-2 w-full">
        <WaveformBars
          previewUrl={faixa.previewUrl}
          height={docked ? 64 : 88}
          barCount={180}
          interactive
          playheadPct={pct(cur)}
          overlays={overlays}
          trimEdit={{
            durationSec: durSec,
            trimStartSec: trimIni,
            trimEndSec: trimFim,
            mixSec: mix,
            onTrimStart: (s) => setTrimIni(Math.max(0, s)),
            onTrimEnd: (s) => setTrimFim(Math.max(0, s)),
            onMix: (s) => setMix(s),
          }}
          onSeek={(ratio) => seekTo(ratio, true)}
          className="w-full"
        />
        <WaveformEditBadges
          hasTrim={faixa.trimInicioMs > 0 || faixa.trimFimMs > 0 || trimIni > 0 || trimFim > 0}
          hasManualMix={!faixa.mixAuto}
        />
      </div>
      <div className="mb-4 flex items-center justify-between text-[10px] text-slate-400">
        <span>{fmt(cur)}</span>
        <span>trecho útil: {fmt(efetivoInicio)} – {fmt(efetivoFim)}</span>
        <span>{fmt(durSec)}</span>
      </div>

      <div className={`mb-3 flex flex-wrap items-center gap-3${docked ? " text-slate-400" : ""}`}>
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
            `Toca a partir de ${fmt(seekSec)} — clique na waveform ou use os campos abaixo para trim`
          : "Sem versão de uso para tocar"}
        </span>
      </div>

      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-3${docked ? " text-white" : ""}`}>
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

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          {saving ? "Salvando…" : "Salvar ajustes"}
        </button>
        {savedMsg ? <span className="text-sm text-emerald-600">{savedMsg}</span> : null}
      </div>
    </div>
  );
}
