"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChamadosBoard } from "@/components/chamados/ChamadosBoard";
import {
  ChamadosConversasPanel,
  type ConversaAssuntoListItem,
} from "@/components/chamados/ChamadosConversasPanel";
import type { ChamadoParticipant, ChamadosResumoView } from "@/lib/chamados/chamadoTypes";

type MainView = "kanban" | "conversa";

function parseParticipants(data: unknown): ChamadoParticipant[] {
  if (!data || typeof data !== "object" || !("participants" in data)) return [];
  const rows = (data as { participants?: unknown }).participants;
  return Array.isArray(rows) ? (rows as ChamadoParticipant[]) : [];
}

type ChamadosWorkspaceProps = {
  /** Layout mais alto no shell /m (PWA). */
  mobile?: boolean;
};

export function ChamadosWorkspace({ mobile = false }: ChamadosWorkspaceProps) {
  const searchParams = useSearchParams();
  const conversaSlug = searchParams.get("conversa");
  const chamadoId = searchParams.get("chamado");

  const [mainView, setMainView] = useState<MainView>(conversaSlug ? "conversa" : "kanban");
  const [selectedAssunto, setSelectedAssunto] = useState<ConversaAssuntoListItem | null>(null);
  const [participants, setParticipants] = useState<ChamadoParticipant[]>([]);
  const [resumo, setResumo] = useState<ChamadosResumoView | null>(null);

  useEffect(() => {
    void Promise.all([
      fetch("/api/chamados/participants", { credentials: "same-origin" }).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch("/api/chamados", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([pData, cData]) => {
        setParticipants(parseParticipants(pData));
        const r = (cData as { resumo?: ChamadosResumoView })?.resumo;
        setResumo(r && typeof r === "object" ? r : null);
      })
      .catch(() => {
        setParticipants([]);
        setResumo(null);
      });
  }, []);

  const onSelectAssunto = useCallback((a: ConversaAssuntoListItem | null) => {
    setSelectedAssunto(a);
    if (a) setMainView("conversa");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (a) url.searchParams.set("conversa", a.slug);
      else url.searchParams.delete("conversa");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, []);

  return (
    <div
      className={
        "flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 " +
        (mobile ?
          "min-h-[60vh] max-h-[calc(100dvh-11rem)]"
        : "min-h-[420px] max-h-[calc(100vh-9rem)]")
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <button
          type="button"
          onClick={() => {
            setMainView("kanban");
          }}
          className={
            "rounded-full px-3 py-1 text-xs font-semibold " +
            (mainView === "kanban" ?
              "bg-violet-600 text-white"
            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")
          }
        >
          Quadro kanban
          {resumo && resumo.chamadosNaoLidos > 0 ?
            <span className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {resumo.chamadosNaoLidos > 99 ? "99+" : resumo.chamadosNaoLidos}
            </span>
          : null}
        </button>
        <button
          type="button"
          onClick={() => setMainView("conversa")}
          className={
            "rounded-full px-3 py-1 text-xs font-semibold " +
            (mainView === "conversa" ?
              "bg-violet-600 text-white"
            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")
          }
        >
          Conversas {selectedAssunto ? `· ${selectedAssunto.display}` : ""}
          {resumo && (resumo.conversasNaoLidas > 0 || resumo.conversasMencoes > 0) ?
            <span className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {resumo.conversasMencoes > 0 ? "@" : resumo.conversasNaoLidas > 99 ? "99+" : resumo.conversasNaoLidas}
            </span>
          : null}
        </button>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div
          className={
            mainView === "kanban" ?
              "h-full max-h-full w-full shrink-0 overflow-hidden border-b border-slate-200 dark:border-slate-700 lg:w-56 lg:max-w-[14rem] lg:border-b-0 lg:border-r xl:w-60"
            : "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          }
        >
          <ChamadosConversasPanel
            selectedId={selectedAssunto?.id ?? null}
            onSelect={onSelectAssunto}
            participants={participants}
            initialSlug={conversaSlug}
            hideChat={mainView === "kanban"}
          />
        </div>

        {mainView === "kanban" ?
          <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
            <ChamadosBoard embeddedLayout initialChamadoId={chamadoId} />
          </div>
        : null}
      </div>
    </div>
  );
}
