"use client";

import { useEffect, useState } from "react";
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
  /** Incrementado pelo botão Atualizar no cabeçalho da página. */
  refreshToken?: number;
  selectedAssunto: ConversaAssuntoListItem | null;
  onSelectAssunto: (a: ConversaAssuntoListItem | null) => void;
};

export function ChamadosWorkspace({
  view,
  mobile = false,
  refreshToken = 0,
  selectedAssunto,
  onSelectAssunto,
}: ChamadosWorkspaceProps) {
  const searchParams = useSearchParams();
  const conversaSlug = searchParams.get("conversa");
  const chamadoId = searchParams.get("chamado");

  const mainView = view;
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

  return (
    <div
      className={
        "flex h-full min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 " +
        (mobile ? "min-h-[60vh] max-h-[calc(100dvh-11rem)]" : "min-h-[320px]")
      }
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div
          className={
            mainView === "kanban" ?
              "h-full max-h-full w-full shrink-0 overflow-hidden border-b border-slate-200 dark:border-slate-700 lg:w-56 lg:max-w-[14rem] lg:border-b-0 lg:border-r xl:w-60"
            : "flex h-full max-h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          }
        >
          <ChamadosConversasPanel
            selectedId={selectedAssunto?.id ?? null}
            selectedItem={selectedAssunto}
            onSelect={onSelectAssunto}
            participants={participants}
            viewerEmail={viewerEmail}
            initialSlug={conversaSlug}
            hideChat={mainView === "kanban"}
            refreshToken={refreshToken}
          />
        </div>

        {mainView === "kanban" ?
          <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
            <ChamadosBoard embeddedLayout initialChamadoId={chamadoId} refreshToken={refreshToken} />
          </div>
        : null}
      </div>
    </div>
  );
}
