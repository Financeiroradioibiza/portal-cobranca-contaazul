"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DuplicataComparePanel,
  type DuplicataCompareData,
} from "@/components/criacao/DuplicataComparePanel";

type JobItem = {
  id: string;
  arquivoNome: string;
  status: string;
  musicaId: string | null;
  duplicataDeId: string | null;
  erroMsg: string;
};

type JobMeta = {
  titulo: string;
  clienteNome: string;
  uploadTagNome: string;
  pastaNome: string;
  programacaoNome: string;
  criativoNome?: string;
};

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
  const [approving, setApproving] = useState(false);
  const [approveErr, setApproveErr] = useState<string | null>(null);
  const [selDupeId, setSelDupeId] = useState<string | null>(null);
  const [dupeCompare, setDupeCompare] = useState<DuplicataCompareData | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [resolvingDupe, setResolvingDupe] = useState(false);
  const [bulkResolving, setBulkResolving] = useState(false);
  const compareRef = useRef<HTMLDivElement>(null);

  const dupes = items.filter((i) => i.status === "duplicata");
  const itensDuplicataDescartada = items.filter((i) =>
    (i.erroMsg ?? "").startsWith("Descartada (duplicata confirmada)"),
  ).length;

  const destinoLabel =
    jobMeta.pastaNome ?
      `${jobMeta.clienteNome ? `${jobMeta.clienteNome} · ` : ""}${jobMeta.programacaoNome} / ${jobMeta.pastaNome}`
    : jobMeta.uploadTagNome ?
      `Biblioteca · tag ${jobMeta.uploadTagNome}`
    : "Biblioteca";

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
        {jobMeta.uploadTagNome ?
          <div className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/90">
            Tag do lote: <strong>{jobMeta.uploadTagNome}</strong> (aplicada automaticamente)
          </div>
        : null}
        {itensDuplicataDescartada > 0 ?
          <div className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/90">
            {itensDuplicataDescartada} faixa(s) idêntica(s) confirmada(s) automaticamente — tag adicionada no acervo.
          </div>
        : null}
        <p className="mt-2 text-xs text-amber-800/70 dark:text-amber-300/70">
          Mix, trim e tags extras não são revisados aqui — ajuste depois em Edição de música, se necessário.
        </p>
      </div>

      {dupes.length > 0 ?
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">
              {dupes.length} possível{dupes.length === 1 ? "" : "is"} duplicata{dupes.length === 1 ? "" : "s"} — compare as ondas
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
      : <p className="text-sm text-slate-500">Nenhuma duplicata pendente — pode aprovar o lote.</p>}

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
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
  );
}
