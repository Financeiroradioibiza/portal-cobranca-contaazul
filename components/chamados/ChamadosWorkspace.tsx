"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChamadosBoard } from "@/components/chamados/ChamadosBoard";
import {
  ChamadosConversasPanel,
  type ConversaAssuntoListItem,
} from "@/components/chamados/ChamadosConversasPanel";
import type { ChamadoParticipant } from "@/lib/chamados/chamadoTypes";

export type ChamadosWorkspaceView = "kanban" | "conversa";

type ChamadosWorkspaceProps = {
  view: ChamadosWorkspaceView;
  /** Layout mais alto no shell /m (PWA). */
  mobile?: boolean;
};

export function ChamadosWorkspace({ view, mobile = false }: ChamadosWorkspaceProps) {
  const searchParams = useSearchParams();
  const conversaSlug = searchParams.get("conversa");
  const chamadoId = searchParams.get("chamado");

  const mainView = view;
  const [selectedAssunto, setSelectedAssunto] = useState<ConversaAssuntoListItem | null>(null);
  const [participants, setParticipants] = useState<ChamadoParticipant[]>([]);
  const [viewerEmail, setViewerEmail] = useState("");

  useEffect(() => {
    void Promise.all([
      fetch("/api/chamados/participants", { credentials: "same-origin" }).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch("/api/auth/me", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([pData, me]) => {
        if (pData && typeof pData === "object" && "participants" in pData) {
          const rows = (pData as { participants?: unknown }).participants;
          setParticipants(Array.isArray(rows) ? (rows as ChamadoParticipant[]) : []);
        } else {
          setParticipants([]);
        }
        const email = (me as { email?: string } | null)?.email;
        setViewerEmail(typeof email === "string" ? email : "");
      })
      .catch(() => {
        setParticipants([]);
        setViewerEmail("");
      });
  }, []);

  const onSelectAssunto = useCallback((a: ConversaAssuntoListItem | null) => {
    setSelectedAssunto(a);
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
            viewerEmail={viewerEmail}
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
