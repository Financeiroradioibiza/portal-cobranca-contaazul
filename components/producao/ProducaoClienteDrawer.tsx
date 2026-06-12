"use client";

import type { DashboardClienteDetail } from "@/lib/cadastros/producaoDashboardService";

type Props = {
  detail: DashboardClienteDetail | null;
  onClose: () => void;
};

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  const v = value?.trim();
  if (!v) return null;
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-slate-100 py-2 text-sm dark:border-slate-800">
      <dt className="font-semibold text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-slate-900 dark:text-slate-100">{v}</dd>
    </div>
  );
}

export function ProducaoClienteDrawer({ detail, onClose }: Props) {
  if (!detail) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-400">
              Cliente
            </p>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{detail.nome}</h2>
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-2">
          <dl>
            <Row label="Razão social" value={detail.razaoSocial} />
            <Row label="CNPJ/CPF" value={detail.documento} />
            <Row label="Marca / grupo" value={detail.grupoNome} />
            <Row label="E-mail cobrança" value={detail.emailCobranca} />
            <Row label="Nº PDV (cobrança)" value={String(detail.numeroPdvSite)} />
            <Row label="Movimento" value={detail.movimento} />
            <Row label="Contratos ativos" value={detail.contratosAtivosTexto} />
            <Row label="Valor cliente" value={detail.valorClienteTexto} />
            <Row label="Observações" value={detail.observacoesLinha} />
            {detail.isCustom ?
              <p className="mt-3 text-xs text-violet-600 dark:text-violet-300">
                Grupo manual da produção musical (agrega vários clientes Rio).
              </p>
            : null}
          </dl>
        </div>
      </aside>
    </div>
  );
}
