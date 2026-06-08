"use client";

import { ConsultaPainelDialog } from "@/components/ConsultaPainelDialog";

export function ConsultaPainelPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
        Consulta painel Ibiza
      </h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Busca cliente ou PDV no painel de produção. A consulta abre ao entrar nesta página; use o botão abaixo para
        reabrir.
      </p>
      <div className="mt-4">
        <ConsultaPainelDialog openOnMount />
      </div>
    </div>
  );
}
