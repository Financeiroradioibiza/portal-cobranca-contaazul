"use client";

import { ETAPAS, ETAPA_LABEL, toKanbanItem, type FilaItemForKanban } from "@/lib/criacao/filaKanban";

const STATUS_TONE: Record<string, string> = {
  aguardando: "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
  processando: "border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40",
  duplicata: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
  concluido: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30",
  erro: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30",
};

const STATUS_LABEL: Record<string, string> = {
  aguardando: "Aguardando",
  processando: "Processando",
  concluido: "Concluído",
  erro: "Erro",
  duplicata: "Duplicata",
};

type Props = {
  jobId: string;
  jobEtapaAtual: string;
  items: Array<{
    id: string;
    arquivoNome: string;
    status: string;
    etapaAtual?: string;
    musicaId?: string | null;
    duplicataDeId?: string | null;
    erroMsg?: string;
  }>;
  onResolveDuplicata: (itemId: string, decision: "nova" | "existente") => void;
};

function KanbanCard({
  item,
  onResolveDuplicata,
}: {
  item: FilaItemForKanban;
  onResolveDuplicata: Props["onResolveDuplicata"];
}) {
  return (
    <div
      className={
        "rounded-lg border px-2.5 py-2 text-xs shadow-sm " + (STATUS_TONE[item.status] ?? STATUS_TONE.aguardando)
      }
    >
      <p className="truncate font-medium text-slate-800 dark:text-slate-100" title={item.arquivoNome}>
        {item.arquivoNome}
      </p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {STATUS_LABEL[item.status] ?? item.status}
      </p>
      {item.status === "duplicata" ?
        <div className="mt-2 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => onResolveDuplicata(item.id, "nova")}
            className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Nova faixa
          </button>
          <button
            type="button"
            onClick={() => onResolveDuplicata(item.id, "existente")}
            className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-600"
          >
            Descartar
          </button>
        </div>
      : null}
      {item.erroMsg ?
        <p className="mt-1 text-[10px] leading-snug text-red-600 dark:text-red-400">{item.erroMsg}</p>
      : null}
    </div>
  );
}

export function FilaJobKanban({ jobEtapaAtual, items, onResolveDuplicata }: Props) {
  const kanbanItems = items.map((i) => toKanbanItem(i, jobEtapaAtual));
  const byEtapa = new Map<string, FilaItemForKanban[]>();
  for (const etapa of ETAPAS) byEtapa.set(etapa, []);
  for (const item of kanbanItems) {
    const list = byEtapa.get(item.kanbanEtapa) ?? [];
    list.push(item);
    byEtapa.set(item.kanbanEtapa, list);
  }

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-2">
        {ETAPAS.map((etapa) => {
          const col = byEtapa.get(etapa) ?? [];
          const isJobHere = jobEtapaAtual === etapa;
          return (
            <div
              key={etapa}
              className={
                "flex w-[168px] shrink-0 flex-col rounded-lg border " +
                (isJobHere
                  ? "border-slate-900 bg-slate-100/80 dark:border-slate-100 dark:bg-slate-800/60"
                  : "border-slate-200 bg-white/60 dark:border-slate-800 dark:bg-slate-950/30")
              }
            >
              <div className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  {ETAPA_LABEL[etapa] ?? etapa}
                </p>
                <p className="text-[11px] tabular-nums text-slate-500">{col.length}</p>
              </div>
              <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto p-2">
                {col.length === 0 ?
                  <p className="py-4 text-center text-[10px] text-slate-400">—</p>
                : col.map((item) => (
                    <KanbanCard key={item.id} item={item} onResolveDuplicata={onResolveDuplicata} />
                  ))
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
