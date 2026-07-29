"use client";

import { CompareTrack } from "@/components/criacao/waveform/CompareTrack";

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
