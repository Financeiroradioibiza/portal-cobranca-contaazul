"use client";

import { Suspense, useCallback, useState } from "react";
import { ChamadosWorkspace, type ChamadosWorkspaceView } from "@/components/chamados/ChamadosWorkspace";

type Props = {
  view: ChamadosWorkspaceView;
  mobile?: boolean;
};

export function ChamadosPortalShell({ view, mobile = false }: Props) {
  const [refreshToken, setRefreshToken] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  return (
    <div className={mobile ? "flex min-h-0 flex-col gap-3" : "portal-page min-w-0"}>
      {!mobile ?
        <header className="portal-page-header flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="portal-page-crumb">IbiZap</div>
            <h1 className="portal-page-title">
              {view === "conversa" ? "Conversas" : "Quadro kanban"}
            </h1>
          </div>
          <button
            type="button"
            onClick={bumpRefresh}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
          >
            ↻ Atualizar
          </button>
        </header>
      : null}
      <div className={mobile ? undefined : "portal-page-body"}>
        <Suspense
          fallback={
            <p className="text-sm text-slate-500">{mobile ? "Carregando IbiZap…" : "Carregando…"}</p>
          }
        >
          <ChamadosWorkspace view={view} mobile={mobile} refreshToken={refreshToken} />
        </Suspense>
      </div>
    </div>
  );
}
