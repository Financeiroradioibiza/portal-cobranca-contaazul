"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LazyWaveformBars } from "@/components/criacao/waveform/WaveformBars";
import { MIX_PADRAO_SEGUNDOS } from "@/lib/criacao/criacaoDefaults";
import { WaveformBars } from "@/components/criacao/waveform/WaveformBars";
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
};

export function FilaRevisaoWorkflow({
  jobId,
  items,
  jobMeta,
  onResolveDuplicata,
  onApproved,
}: {
  jobId: string;
  items: JobItem[];
  jobMeta: JobMeta;
  onResolveDuplicata: (itemId: string, decision: "nova" | "existente") => Promise<void>;
  onApproved: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [loadingFaixas, setLoadingFaixas] = useState(false);
  const [sel, setSel] = useState<Faixa | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveErr, setApproveErr] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const dupes = items.filter((i) => i.status === "duplicata");
  const concluidos = items.filter((i) => i.status === "concluido");

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
      const data = (await res.json()) as { faixas: Faixa[] };
      setFaixas(data.faixas);
      setSel((prev) => (prev ? data.faixas.find((f) => f.id === prev.id) ?? null : null));
    } catch {
      setFaixas([]);
    } finally {
      setLoadingFaixas(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (step >= 2) void loadFaixas();
  }, [step, loadFaixas]);

  useEffect(() => {
    if (dupes.length === 0 && step === 1) setStep(2);
  }, [dupes.length, step]);

  useEffect(() => {
    if (sel) editorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [sel?.id]);

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
            <p className="text-sm text-slate-500">Nenhuma duplicata pendente. Avance para mix/trim.</p>
          : <ul className="space-y-2">
              {dupes.map((it) => (
                <li
                  key={it.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm dark:border-amber-900 dark:bg-slate-900"
                >
                  <span className="min-w-0 flex-1 truncate">{it.arquivoNome}</span>
                  <span className="text-[10px] font-bold uppercase text-amber-700">Duplicata</span>
                  <button
                    type="button"
                    onClick={() => void onResolveDuplicata(it.id, "nova")}
                    className="rounded bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                  >
                    Manter como nova
                  </button>
                  <button
                    type="button"
                    onClick={() => void onResolveDuplicata(it.id, "existente")}
                    className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-600"
                  >
                    É a mesma (descartar)
                  </button>
                </li>
              ))}
            </ul>
          }
          {dupes.length === 0 ?
            <button
              type="button"
              onClick={() => setStep(2)}
              className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
            >
              Continuar → Mix e trim
            </button>
          : null}
        </div>
      : null}

      {step === 2 ?
        <div>
          {loadingFaixas ?
            <p className="text-sm text-slate-500">Carregando faixas…</p>
          : faixas.length === 0 ?
            <p className="text-sm text-slate-500">Nenhuma faixa pronta neste lote ({concluidos.length} processadas).</p>
          : <>
              <p className="mb-2 text-xs text-slate-500">
                {faixas.length} faixa{faixas.length === 1 ? "" : "s"} — clique para editar ponto de mix e trim.
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
            Confira as tags antes de publicar
            {jobMeta.uploadTagNome ? ` (será aplicada: ${jobMeta.uploadTagNome})` : ""}
            {jobMeta.pastaNome ? ` na pasta ${jobMeta.pastaNome}` : ""}.
          </p>
          {loadingFaixas ?
            <p className="text-sm text-slate-500">Carregando…</p>
          : <ul className="max-h-64 space-y-1 overflow-auto rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-800 dark:bg-slate-900">
              {faixas.map((f) => (
                <li key={f.id} className="border-b border-slate-100 py-1 last:border-0 dark:border-slate-800">
                  <div className="font-medium">{f.titulo}</div>
                  <div className="text-xs text-slate-500">{f.artista}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
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

  const efetivoInicio = Math.min(trimIni, Math.max(0, durSec - 0.1));
  const efetivoFim = Math.max(efetivoInicio + 0.1, durSec - trimFim);
  const pct = (v: number) => (durSec > 0 ? Math.min(100, Math.max(0, (v / durSec) * 100)) : 0);

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
      <WaveformBars
        previewUrl={faixa.previewUrl}
        height={72}
        barCount={160}
        interactive
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
        className="mb-3 w-full"
      />
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
