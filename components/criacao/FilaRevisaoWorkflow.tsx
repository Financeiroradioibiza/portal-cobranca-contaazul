"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CriacaoTagAssignModal, type CriacaoTagOption } from "@/components/criacao/CriacaoTagAssignModal";
import {
  DuplicataComparePanel,
  type DuplicataCompareData,
} from "@/components/criacao/DuplicataComparePanel";
import { LazyWaveformBars } from "@/components/criacao/waveform/WaveformBars";
import { MIX_PADRAO_SEGUNDOS } from "@/lib/criacao/criacaoDefaults";
import { WaveformBars, WaveformEditBadges } from "@/components/criacao/waveform/WaveformBars";
import { TAG_SOURCE_LABEL } from "@/lib/criacao/bibliotecaService";

type JobItem = {
  id: string;
  arquivoNome: string;
  status: string;
  musicaId: string | null;
  duplicataDeId: string | null;
  erroMsg: string;
};

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
  tagsManuais: { id: string; nome: string; cor: string; criativoIniciais: string; criativoNome: string }[];
  tagsAuto: { fonte: string; valor: string }[];
};

type JobMeta = {
  titulo: string;
  clienteNome: string;
  uploadTagNome: string;
  pastaNome: string;
  programacaoNome: string;
  criativoNome?: string;
};

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function FilaRevisaoWorkflow({
  jobId,
  items,
  jobMeta,
  onResolveDuplicata,
  onItemsChanged,
  onApproved,
}: {
  jobId: string;
  items: JobItem[];
  jobMeta: JobMeta;
  onResolveDuplicata: (itemId: string, decision: "nova" | "existente") => Promise<void>;
  onItemsChanged?: () => Promise<void>;
  onApproved: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [itensDuplicataDescartada, setItensDuplicataDescartada] = useState(0);
  const [loadingFaixas, setLoadingFaixas] = useState(false);
  const [sel, setSel] = useState<Faixa | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveErr, setApproveErr] = useState<string | null>(null);
  const [tagCatalog, setTagCatalog] = useState<CriacaoTagOption[]>([]);
  const [tagEditFaixa, setTagEditFaixa] = useState<Faixa | null>(null);
  const [selDupeId, setSelDupeId] = useState<string | null>(null);
  const [dupeCompare, setDupeCompare] = useState<DuplicataCompareData | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [resolvingDupe, setResolvingDupe] = useState(false);
  const [bulkResolving, setBulkResolving] = useState(false);
  const compareRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const dupes = items.filter((i) => i.status === "duplicata");

  const destinoLabel =
    jobMeta.pastaNome ?
      `${jobMeta.clienteNome ? `${jobMeta.clienteNome} · ` : ""}${jobMeta.programacaoNome} / ${jobMeta.pastaNome}`
    : jobMeta.uploadTagNome ?
      `Biblioteca · tag ${jobMeta.uploadTagNome}`
    : "Biblioteca";

  const loadFaixas = useCallback(async () => {
    setLoadingFaixas(true);
    try {
      const res = await fetch(`/api/criacao/fila/${jobId}/revisao-faixas`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        faixas: Faixa[];
        itensDuplicataDescartada?: number;
      };
      setFaixas(data.faixas);
      setItensDuplicataDescartada(data.itensDuplicataDescartada ?? 0);
      setSel((prev) => (prev ? data.faixas.find((f) => f.id === prev.id) ?? null : null));
      setTagEditFaixa((prev) => (prev ? data.faixas.find((f) => f.id === prev.id) ?? null : null));
    } catch {
      setFaixas([]);
    } finally {
      setLoadingFaixas(false);
    }
  }, [jobId]);

  const loadTagCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/criacao/tags");
      if (!res.ok) return;
      const data = (await res.json()) as { tags?: CriacaoTagOption[] };
      setTagCatalog(data.tags ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (step >= 2) void loadFaixas();
  }, [step, loadFaixas]);

  useEffect(() => {
    if (step === 3) void loadTagCatalog();
  }, [step, loadTagCatalog]);

  useEffect(() => {
    if (dupes.length === 0 && step === 1) setStep(2);
  }, [dupes.length, step]);

  useEffect(() => {
    if (sel) editorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [sel?.id]);

  useEffect(() => {
    if (selDupeId) compareRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selDupeId, dupeCompare?.itemId]);

  const loadDupeCompare = useCallback(async (itemId: string) => {
    setLoadingCompare(true);
    setDupeCompare(null);
    try {
      const res = await fetch(`/api/criacao/fila/item/${itemId}/duplicata-compare`);
      if (!res.ok) return;
      const data = (await res.json()) as { compare?: DuplicataCompareData };
      if (data.compare) setDupeCompare(data.compare);
    } catch {
      /* ignore */
    } finally {
      setLoadingCompare(false);
    }
  }, []);

  async function selectDupe(itemId: string) {
    if (selDupeId === itemId) {
      setSelDupeId(null);
      setDupeCompare(null);
      return;
    }
    setSelDupeId(itemId);
    await loadDupeCompare(itemId);
  }

  async function resolveOne(itemId: string, decision: "nova" | "existente") {
    setResolvingDupe(true);
    try {
      await onResolveDuplicata(itemId, decision);
      if (selDupeId === itemId) {
        setSelDupeId(null);
        setDupeCompare(null);
      }
      await onItemsChanged?.();
    } finally {
      setResolvingDupe(false);
    }
  }

  async function resolveAll(decision: "nova" | "existente") {
    const label =
      decision === "existente" ?
        `Confirmar todas as ${dupes.length} duplicata(s) como «é a mesma» e descartar?`
      : `Manter todas as ${dupes.length} faixa(s) como novas?`;
    if (!window.confirm(label)) return;
    setBulkResolving(true);
    try {
      const res = await fetch(`/api/criacao/fila/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_duplicatas", decision }),
      });
      if (!res.ok) return;
      setSelDupeId(null);
      setDupeCompare(null);
      await onItemsChanged?.();
    } finally {
      setBulkResolving(false);
    }
  }

  async function approve() {
    setApproving(true);
    setApproveErr(null);
    try {
      const res = await fetch(`/api/criacao/fila/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
      if (!res.ok || !data.ok) {
        setApproveErr(
          data.reason === "duplicatas_pendentes" ? "Resolva todas as duplicatas primeiro."
          : data.reason === "processamento_pendente" ? "Ainda há faixas processando."
          : "Não foi possível aprovar.",
        );
        return;
      }
      onApproved();
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/30">
        <div className="font-semibold text-amber-900 dark:text-amber-200">Revisão do lote — {jobMeta.titulo}</div>
        <div className="text-xs text-amber-800/80 dark:text-amber-300/80">Destino: {destinoLabel}</div>
        {itensDuplicataDescartada > 0 ?
          <div className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/90">
            {itensDuplicataDescartada} faixa(s) confirmada(s) como duplicata — mix/trim/tags ignorados (já existem no acervo).
          </div>
        : null}
        <div className="mt-2 flex flex-wrap gap-1">
          {[
            { n: 1 as const, label: "Duplicatas" },
            { n: 2 as const, label: "Mix e trim" },
            { n: 3 as const, label: "Tags e aprovar" },
          ].map(({ n, label }) => (
            <button
              key={n}
              type="button"
              onClick={() => setStep(n)}
              className={
                "rounded px-2 py-0.5 text-[10px] font-bold uppercase " +
                (step === n ?
                  "bg-amber-600 text-white"
                : "bg-white/60 text-amber-800 dark:bg-slate-900 dark:text-amber-300")
              }
            >
              {n}. {label}
            </button>
          ))}
        </div>
      </div>

      {step === 1 ?
        <div>
          {dupes.length === 0 ?
            <p className="text-sm text-slate-500">Nenhuma duplicata pendente.</p>
          : <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">
                  {dupes.length} duplicata{dupes.length === 1 ? "" : "s"} — clique numa faixa para comparar
                </span>
                <button
                  type="button"
                  disabled={bulkResolving || resolvingDupe}
                  onClick={() => void resolveAll("existente")}
                  className="rounded-lg border border-amber-400 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-200 disabled:opacity-40 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
                >
                  {bulkResolving ? "Processando…" : "Descartar todas (é a mesma)"}
                </button>
                <button
                  type="button"
                  disabled={bulkResolving || resolvingDupe}
                  onClick={() => void resolveAll("nova")}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
                >
                  Manter todas como novas
                </button>
              </div>
              <ul className="space-y-2">
                {dupes.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => void selectDupe(it.id)}
                      className={
                        "flex w-full flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition " +
                        (selDupeId === it.id ?
                          "border-amber-500 bg-amber-50 ring-1 ring-amber-400/50 dark:border-amber-600 dark:bg-amber-950/40"
                        : "border-amber-200 bg-white hover:bg-amber-50/50 dark:border-amber-900 dark:bg-slate-900 dark:hover:bg-amber-950/20")
                      }
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{it.arquivoNome}</span>
                      <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
                        {selDupeId === it.id ? "Comparando ▲" : "Comparar ▼"}
                      </span>
                    </button>
                    {selDupeId === it.id ?
                      <div ref={compareRef}>
                        {loadingCompare ?
                          <p className="mt-2 text-xs text-slate-500">Carregando comparação…</p>
                        : dupeCompare ?
                          <DuplicataComparePanel
                            compare={dupeCompare}
                            resolving={resolvingDupe}
                            onResolve={(decision) => void resolveOne(it.id, decision)}
                          />
                        : <p className="mt-2 text-xs text-red-600">Não foi possível carregar a comparação.</p>}
                      </div>
                    : null}
                  </li>
                ))}
              </ul>
            </>
          }
          {dupes.length === 0 ?
            <button
              type="button"
              onClick={() => setStep(faixas.length === 0 ? 3 : 2)}
              className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
            >
              {faixas.length === 0 ? "Continuar → Aprovar" : "Continuar → Mix e trim"}
            </button>
          : null}
        </div>
      : null}

      {step === 2 ?
        <div>
          {loadingFaixas ?
            <p className="text-sm text-slate-500">Carregando faixas…</p>
          : faixas.length === 0 ?
            <div className="space-y-2 text-sm text-slate-500">
              <p>Nenhuma faixa nova precisa de mix/trim neste lote.</p>
              {itensDuplicataDescartada > 0 ?
                <p className="text-xs">Duplicatas confirmadas usam o cadastro anterior do acervo.</p>
              : null}
            </div>
          : <>
              <p className="mb-2 text-xs text-slate-500">
                {faixas.length} faixa{faixas.length === 1 ? "" : "s"} nova(s) — clique para ouvir e ajustar mix/trim.
              </p>
              <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-200 bg-slate-950 dark:border-slate-800">
                {faixas.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => setSel(f)}
                      className={
                        "grid w-full grid-cols-1 gap-2 px-3 py-2 text-left md:grid-cols-[1fr_minmax(180px,280px)] " +
                        (sel?.id === f.id ? "bg-slate-800 ring-1 ring-amber-500/40" : "hover:bg-slate-900/60")
                      }
                    >
                      <LazyWaveformBars previewUrl={f.previewUrl} height={36} barCount={100} barColor="rgba(255,255,255,0.7)" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-100">{f.titulo}</div>
                        <div className="truncate text-xs text-slate-400">{f.artista}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {sel ?
                <div ref={editorRef} className="mt-3">
                  <FaixaEditorInline
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
          <button
            type="button"
            onClick={() => setStep(3)}
            className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 dark:border-slate-600"
          >
            Continuar → Tags e aprovar
          </button>
        </div>
      : null}

      {step === 3 ?
        <div>
          <p className="mb-2 text-xs text-slate-500">
            Revise e edite as tags criativas antes de publicar
            {jobMeta.uploadTagNome ? ` (lote: ${jobMeta.uploadTagNome})` : ""}
            {jobMeta.pastaNome ? ` na pasta ${jobMeta.pastaNome}` : ""}.
          </p>
          {loadingFaixas ?
            <p className="text-sm text-slate-500">Carregando…</p>
          : faixas.length === 0 && itensDuplicataDescartada > 0 ?
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              Só duplicatas confirmadas neste lote — pode aprovar para concluir.
            </p>
          : <ul className="max-h-80 space-y-2 overflow-auto rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-800 dark:bg-slate-900">
              {faixas.map((f) => (
                <li key={f.id} className="rounded-lg border border-slate-100 px-2 py-2 dark:border-slate-800">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{f.titulo}</div>
                      <div className="text-xs text-slate-500">{f.artista}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTagEditFaixa(f)}
                      className="shrink-0 rounded border border-violet-300 px-2 py-0.5 text-[10px] font-semibold text-violet-800 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-200 dark:hover:bg-violet-950/40"
                    >
                      Editar tags
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {f.tagsManuais.map((t) => (
                      <span
                        key={t.id}
                        className="rounded px-1 py-0.5 text-[9px] font-bold"
                        style={{ background: t.cor, color: "#fff" }}
                      >
                        {t.criativoIniciais ? `[${t.criativoIniciais}] ` : ""}
                        {t.nome}
                      </span>
                    ))}
                    {f.tagsAuto.slice(0, 4).map((t, i) => (
                      <span
                        key={`${t.fonte}-${i}`}
                        className="rounded border border-slate-600 px-1 py-0.5 text-[9px] text-slate-400"
                      >
                        [{TAG_SOURCE_LABEL[t.fonte] ?? t.fonte}] {t.valor}
                      </span>
                    ))}
                    {f.tagsManuais.length === 0 && f.tagsAuto.length === 0 ?
                      <span className="text-[10px] text-slate-400">Sem tags — use Editar tags</span>
                    : null}
                  </div>
                </li>
              ))}
            </ul>
          }
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={approving || dupes.length > 0}
              onClick={() => void approve()}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {approving ? "Aprovando…" : "Aprovar lote e publicar"}
            </button>
            {approveErr ? <span className="text-sm text-red-600">{approveErr}</span> : null}
          </div>
        </div>
      : null}

      {tagEditFaixa ?
        <CriacaoTagAssignModal
          musicaId={tagEditFaixa.id}
          titulo={tagEditFaixa.titulo}
          artista={tagEditFaixa.artista}
          assignedIds={tagEditFaixa.tagsManuais.map((t) => t.id)}
          tags={tagCatalog}
          onClose={() => setTagEditFaixa(null)}
          onChanged={async () => {
            await loadFaixas();
          }}
        />
      : null}
    </div>
  );
}

function FaixaEditorInline({
  faixa,
  onSaved,
  onClose,
}: {
  faixa: Faixa;
  onSaved: (f: Faixa) => void;
  onClose: () => void;
}) {
  const durSec = (faixa.durationMs ?? 0) / 1000;
  const [mix, setMix] = useState(faixa.mixSegundosFinais ?? MIX_PADRAO_SEGUNDOS);
  const [trimIni, setTrimIni] = useState(faixa.trimInicioMs / 1000);
  const [trimFim, setTrimFim] = useState(faixa.trimFimMs / 1000);
  const [saving, setSaving] = useState(false);

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

  async function save() {
    setSaving(true);
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
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{faixa.titulo}</div>
          <div className="text-xs text-slate-500">{faixa.artista}</div>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-slate-400">
          Fechar
        </button>
      </div>

      <audio
        ref={audioRef}
        src={faixa.previewUrl ?? undefined}
        crossOrigin="anonymous"
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (a) setCur(a.currentTime);
        }}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onError={() => setPlaying(false)}
        className="hidden"
      />

      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Clique na waveform para ouvir · arraste as linhas para trim · verde = mix
      </div>
      <div className="relative mb-2 w-full">
        <WaveformBars
          previewUrl={faixa.previewUrl}
          height={72}
          barCount={160}
          interactive
          playheadPct={pct(cur)}
          overlays={[
            { leftPct: 0, widthPct: pct(efetivoInicio), color: "rgba(100,116,139,0.55)", label: "início" },
            { leftPct: pct(efetivoFim), widthPct: 100 - pct(efetivoFim), color: "rgba(100,116,139,0.55)", label: "fim" },
            ...(mix > 0 ?
              [{
                leftPct: pct(Math.max(efetivoInicio, efetivoFim - mix)),
                widthPct: pct(Math.min(mix, efetivoFim - efetivoInicio)),
                color: "rgba(52,211,153,0.35)",
                label: "mix",
              }]
            : []),
          ]}
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

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!faixa.previewUrl}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-30 dark:bg-slate-100 dark:text-slate-900"
        >
          {playing ? "⏸" : "▶"}
        </button>
        <span className="text-xs text-slate-500">
          {faixa.previewUrl ?
            `Toca a partir de ${fmt(seekSec)} — ${fmt(cur)} / ${fmt(durSec)}`
          : "Sem áudio de preview — aguarde o processamento terminar"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <label>
          <span className="text-[10px] font-semibold text-slate-500">Mix (s)</span>
          <input
            type="number"
            min={0}
            max={30}
            value={mix}
            onChange={(e) => setMix(Number(e.target.value))}
            className="w-full rounded border px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
        <label>
          <span className="text-[10px] font-semibold text-slate-500">Corte início</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={trimIni}
            onChange={(e) => setTrimIni(Number(e.target.value))}
            className="w-full rounded border px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
        <label>
          <span className="text-[10px] font-semibold text-slate-500">Corte fim</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={trimFim}
            onChange={(e) => setTrimFim(Number(e.target.value))}
            className="w-full rounded border px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
      >
        {saving ? "Salvando…" : "Salvar ajustes"}
      </button>
    </div>
  );
}
