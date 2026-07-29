"use client";

import { useCallback, useEffect, useState } from "react";
import { CompareTrack } from "@/components/criacao/waveform/CompareTrack";
import {
  buildLocalLegacyAudioUrl,
  pingLocalServidorUp,
} from "@/lib/criacao/localServidorUpClient";
import type { ServidorUpTrackVerifyRow } from "@/lib/criacao/servidorUpDownloadVerifyService";

import type { ServidorUpVerifyDecision } from "@/lib/criacao/servidorUpUploadSession";

export type { ServidorUpVerifyDecision };

function TrackCompareRow({
  row,
  legacyPreviewUrl,
  expanded,
  decision,
  onToggle,
  onDecision,
}: {
  row: ServidorUpTrackVerifyRow;
  legacyPreviewUrl: string | null;
  expanded: boolean;
  decision: ServidorUpVerifyDecision | null;
  onToggle: () => void;
  onDecision: (d: ServidorUpVerifyDecision) => void;
}) {
  return (
    <li className="rounded-lg border border-violet-200/80 bg-white/90 dark:border-violet-800 dark:bg-slate-900/70">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            {row.legacyLabel}
          </div>
          <div className="truncate text-[11px] text-slate-500">
            Deemix: {row.deemixLabel}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {decision === "approved" ?
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              Aprovada
            </span>
          : decision === "rejected" ?
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-900 dark:bg-red-950 dark:text-red-200">
              Rejeitada
            </span>
          : null}
          <span className="text-[10px] text-violet-700 dark:text-violet-300">
            {expanded ? "▲" : "▼"} Comparar
          </span>
        </div>
      </button>

      {expanded ?
        <div className="space-y-3 border-t border-violet-100 px-3 py-3 dark:border-violet-900">
          <p className="text-[11px] text-violet-900/90 dark:text-violet-200/90">
            Ouça e compare as waveforms — legado (subido pelo cliente) vs download Deemix.
          </p>

          <CompareTrack
            label="Legado (cliente)"
            subtitle={row.legacyLabel}
            previewUrl={legacyPreviewUrl}
            accentClass="border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30"
            crossOrigin=""
          />

          <CompareTrack
            label="Deemix (Deezer)"
            subtitle={row.deemixLabel}
            previewUrl={row.stagingPreviewUrl}
            accentClass="border-sky-200 bg-sky-50/80 dark:border-sky-900 dark:bg-sky-950/30"
          />

          {!legacyPreviewUrl ?
            <p className="text-[10px] text-amber-800 dark:text-amber-300">
              Legado indisponível — inicie o agente Servidor UP no PC (
              <code className="text-[9px]">Iniciar-ServidorUP</code>) com a pasta raiz configurada.
            </p>
          : null}
          {!row.stagingPreviewUrl ?
            <p className="text-[10px] text-amber-800 dark:text-amber-300">
              MP3 Deemix ainda não acessível no staging — aguarde o download ou use «Recuperar MP3».
            </p>
          : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onDecision("approved")}
              className="rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Aprovar — subir esta faixa
            </button>
            <button
              type="button"
              onClick={() => onDecision("rejected")}
              className="rounded-lg border border-red-400 px-3 py-1.5 text-xs font-semibold text-red-800 dark:border-red-700 dark:text-red-200"
            >
              Rejeitar — não subir
            </button>
          </div>
        </div>
      : null}
    </li>
  );
}

export function ServidorUpDownloadVerifyPanel({
  tracks,
  streamEnabled,
  decisions,
  onDecisionsChange,
}: {
  tracks: ServidorUpTrackVerifyRow[];
  streamEnabled: boolean;
  decisions: Record<string, ServidorUpVerifyDecision>;
  onDecisionsChange: (next: Record<string, ServidorUpVerifyDecision>) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [agentOk, setAgentOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void pingLocalServidorUp().then((h) => {
      if (!cancelled) setAgentOk(Boolean(h?.ok));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setDecision = useCallback(
    (downloadItemId: string, decision: ServidorUpVerifyDecision) => {
      onDecisionsChange({ ...decisions, [downloadItemId]: decision });
      setExpandedId(null);
    },
    [decisions, onDecisionsChange],
  );

  const approvedCount = tracks.filter((t) => decisions[t.downloadItemId] === "approved").length;
  const rejectedCount = tracks.filter((t) => decisions[t.downloadItemId] === "rejected").length;
  const pendingCount = tracks.length - approvedCount - rejectedCount;

  return (
    <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50/80 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-amber-950 dark:text-amber-100">
            Verificação — legado vs Deemix
          </h3>
          <p className="mt-1 max-w-2xl text-xs text-amber-900/90 dark:text-amber-200/90">
            Clique em cada faixa para ver as duas waveforms, ouvir e aprovar antes de subir.
            Os MP3 Deemix ficam em staging temporário no cloud2 e são removidos após o upload.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 text-[10px] font-semibold">
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            {approvedCount} aprovada(s)
          </span>
          {rejectedCount > 0 ?
            <span className="rounded bg-red-100 px-2 py-0.5 text-red-900 dark:bg-red-950 dark:text-red-200">
              {rejectedCount} rejeitada(s)
            </span>
          : null}
          {pendingCount > 0 ?
            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {pendingCount} pendente(s)
            </span>
          : null}
        </div>
      </div>

      {!streamEnabled ?
        <p className="mb-2 text-xs font-semibold text-red-700 dark:text-red-300">
          Preview Deemix indisponível — configure CRIACAO_INGEST_SECRET no portal/cloud2.
        </p>
      : null}
      {agentOk === false ?
        <p className="mb-2 text-xs text-amber-800 dark:text-amber-300">
          Agente Servidor UP offline — só o áudio Deemix estará disponível até iniciar o agente local.
        </p>
      : null}

      <ul className="max-h-[480px] space-y-2 overflow-y-auto">
        {tracks.map((row) => (
          <TrackCompareRow
            key={row.downloadItemId}
            row={row}
            legacyPreviewUrl={agentOk ? buildLocalLegacyAudioUrl(row.relativePath) : null}
            expanded={expandedId === row.downloadItemId}
            decision={decisions[row.downloadItemId] ?? null}
            onToggle={() =>
              setExpandedId((prev) => (prev === row.downloadItemId ? null : row.downloadItemId))
            }
            onDecision={(d) => setDecision(row.downloadItemId, d)}
          />
        ))}
      </ul>

      {pendingCount > 0 ?
        <p className="mt-2 text-[11px] text-amber-900 dark:text-amber-200">
          Aprove ou rejeite todas as faixas antes de «Subir para fila».
        </p>
      : approvedCount === 0 ?
        <p className="mt-2 text-[11px] text-red-800 dark:text-red-300">
          Nenhuma faixa aprovada — aprove ao menos uma para continuar.
        </p>
      : null}
    </div>
  );
}
