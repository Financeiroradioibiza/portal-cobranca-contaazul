"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DOWNLOAD_PROVIDER_LABEL } from "@/lib/criacao/downloadParse";
import {
  groupStagingByJob,
  isInvalidStagingMp3,
  type StagingFileRow,
  type StagingJobGroup,
} from "@/lib/criacao/downloadService";

type LoteOption = { id: string; label: string };

type Props = {
  lotes: LoteOption[];
  /** Faixas já adicionadas a algum lote do upload comum — não listar de novo. */
  excludedDownloadItemIds: Set<string>;
  onImport: (loteId: string, group: StagingJobGroup) => void;
  /** Vindo do link «Importar no Upload» no Download link. */
  highlightOnMount?: boolean;
};

/** Importação opcional de MP3 do Download link — só no upload comum; não usa Servidor UP. */
export function DownloadLinkImportSection({
  lotes,
  excludedDownloadItemIds,
  onImport,
  highlightOnMount = false,
}: Props) {
  const [groups, setGroups] = useState<StagingJobGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [importLoteId, setImportLoteId] = useState("");

  const loadStaging = useCallback(async () => {
    try {
      const res = await fetch("/api/criacao/download?view=staging");
      if (!res.ok) return;
      const data = (await res.json()) as { staging?: StagingFileRow[] };
      setGroups(groupStagingByJob(data.staging ?? []));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStaging();
  }, [loadStaging]);

  useEffect(() => {
    if (lotes.length === 0) return;
    setImportLoteId((prev) => (prev && lotes.some((l) => l.id === prev) ? prev : lotes[0]!.id));
  }, [lotes]);

  useEffect(() => {
    if (!highlightOnMount) return;
    const t = window.setTimeout(() => {
      document.getElementById("import-download")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(t);
  }, [highlightOnMount]);

  const groupsVisible = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          tracks: g.tracks.filter((t) => !excludedDownloadItemIds.has(t.id)),
        }))
        .filter((g) => g.tracks.length > 0),
    [groups, excludedDownloadItemIds],
  );

  return (
    <section
      id="import-download"
      className="mb-5 rounded-xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900 dark:bg-violet-950/25"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-violet-950 dark:text-violet-100">Importar do Download link</h2>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadStaging();
          }}
          className="rounded-lg border border-violet-300 bg-white px-2.5 py-1 text-xs font-semibold text-violet-900 hover:bg-violet-50 dark:border-violet-700 dark:bg-slate-900 dark:text-violet-100"
        >
          Atualizar lista
        </button>
      </div>
      <p className="mb-3 text-xs text-violet-900/80 dark:text-violet-200/80">
        Faixas já baixadas no servidor (cloud2). Escolha o lote, importe, defina pasta/tag e use «Subir para a
        fila». Não altera o fluxo Servidor UP nem o arraste de MP3 do PC.
      </p>
      {loading ?
        <p className="text-xs text-violet-800 dark:text-violet-300">Carregando faixas do servidor…</p>
      : groupsVisible.length === 0 ?
        <div className="text-xs text-violet-800 dark:text-violet-300">
          {groups.length > 0 && excludedDownloadItemIds.size > 0 ?
            <p>Todas as faixas prontas já estão em algum lote abaixo.</p>
          : <>
              <p className="mb-2">Nenhuma faixa pronta no servidor ainda.</p>
              <p className="text-violet-700 dark:text-violet-400">
                No{" "}
                <Link href="/criacao/download" className="font-semibold underline">
                  Download link
                </Link>
                , aguarde o lote ficar <strong>Concluído</strong> e aparecer em «Prontos no servidor».
              </p>
            </>}
        </div>
      : <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-2 font-semibold text-violet-900 dark:text-violet-100">
              Importar no lote:
              <select
                value={importLoteId}
                onChange={(e) => setImportLoteId(e.target.value)}
                className="rounded-lg border border-violet-300 bg-white px-2 py-1.5 font-normal dark:border-violet-700 dark:bg-slate-950"
              >
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ul className="max-h-56 space-y-2 overflow-auto">
            {groupsVisible.map((group) => {
              const validCount = group.tracks.filter((t) => !isInvalidStagingMp3(t.sizeBytes)).length;
              const invalidCount = group.tracks.length - validCount;
              const importCount = validCount > 0 ? validCount : group.tracks.length;
              return (
                <li
                  key={group.jobId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200/80 bg-white px-3 py-2 dark:border-violet-800 dark:bg-slate-900/80"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {group.titulo}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {DOWNLOAD_PROVIDER_LABEL[group.provider]} · {group.tracks.length} faixa
                      {group.tracks.length === 1 ? "" : "s"}
                      {invalidCount > 0 ?
                        <span className="text-red-600 dark:text-red-400"> · {invalidCount} inválida(s)</span>
                      : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!importLoteId}
                    onClick={() => onImport(importLoteId, group)}
                    className="shrink-0 rounded-lg bg-violet-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-40 dark:bg-violet-600"
                  >
                    Importar {importCount} faixa{importCount === 1 ? "" : "s"}
                  </button>
                </li>
              );
            })}
          </ul>
        </>}
    </section>
  );
}
