"use client";

import { Suspense } from "react";
import { ChamadosWorkspace, type ChamadosWorkspaceView } from "@/components/chamados/ChamadosWorkspace";

type Props = {
  view: ChamadosWorkspaceView;
  mobile?: boolean;
};

export function ChamadosPortalShell({ view, mobile = false }: Props) {
  return (
    <div className={mobile ? "flex min-h-0 flex-col gap-3" : "portal-page min-w-0"}>
      {!mobile ?
        <header className="portal-page-header">
          <div>
            <div className="portal-page-crumb">IbiZap</div>
            <h1 className="portal-page-title">
              {view === "conversa" ? "Conversas" : "Quadro kanban"}
            </h1>
          </div>
        </header>
      : null}
      <div className={mobile ? undefined : "portal-page-body"}>
        <Suspense
          fallback={
            <p className="text-sm text-slate-500">{mobile ? "Carregando IbiZap…" : "Carregando…"}</p>
          }
        >
          <ChamadosWorkspace view={view} mobile={mobile} />
        </Suspense>
      </div>
    </div>
  );
}
