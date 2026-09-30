"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChamadosBoard } from "@/components/chamados/ChamadosBoard";
import {
  ChamadosConversasPanel,
  type ConversaAssuntoListItem,
} from "@/components/chamados/ChamadosConversasPanel";
import type { ChamadoParticipant } from "@/lib/chamados/chamadoTypes";

type MainView = "kanban" | "conversa";

function parseParticipants(data: unknown): ChamadoParticipant[] {
  if (!data || typeof data !== "object" || !("participants" in data)) return [];
  const rows = (data as { participants?: unknown }).participants;
  return Array.isArray(rows) ? (rows as ChamadoParticipant[]) : [];
}

export function ChamadosWorkspace() {
  const searchParams = useSearchParams();
  const conversaSlug = searchParams.get("conversa");

  const [mainView, setMainView] = useState<MainView>(conversaSlug ? "conversa" : "kanban");
  const [selectedAssunto, setSelectedAssunto] = useState<ConversaAssuntoListItem | null>(null);
  const [participants, setParticipants] = useState<ChamadoParticipant[]>([]);

  useEffect(() => {
    void fetch("/api/chamados/participants", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setParticipants(parseParticipants(d)))
      .catch(() => setParticipants([]));
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
    <div className="flex min-h-[calc(100vh-12rem)] flex-col rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
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
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          className={
            mainView === "kanban" ?
              "w-full shrink-0 border-b border-slate-200 dark:border-slate-700 lg:w-56 lg:border-b-0 lg:border-r xl:w-64"
            : "flex min-h-[360px] min-w-0 flex-1 flex-col"
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
          <div className="min-w-0 flex-1 overflow-auto p-4">
            <ChamadosBoard embeddedLayout />
          </div>
        : null}
      </div>
    </div>
  );
}
