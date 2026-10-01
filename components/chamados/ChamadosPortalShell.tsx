"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChamadosWorkspace,
  type ChamadosWorkspaceView,
} from "@/components/chamados/ChamadosWorkspace";
import type { ConversaAssuntoListItem } from "@/components/chamados/ChamadosConversasPanel";

type Props = {
  view: ChamadosWorkspaceView;
  mobile?: boolean;
};

function assuntoFromApi(raw: {
  id: string;
  slug: string;
  titulo?: string;
  display: string;
  unreadCount?: number;
  unreadGeneralCount?: number;
  unreadMentionCount?: number;
  mentionUnread?: boolean;
  lastMessagePreview?: string | null;
}): ConversaAssuntoListItem {
  return {
    id: raw.id,
    slug: raw.slug,
    titulo: raw.titulo ?? raw.display,
    display: raw.display,
    unreadCount: raw.unreadCount ?? 0,
    unreadGeneralCount: raw.unreadGeneralCount ?? 0,
    unreadMentionCount: raw.unreadMentionCount ?? 0,
    mentionUnread: raw.mentionUnread ?? false,
    lastMessagePreview: raw.lastMessagePreview ?? null,
  };
}

export function ChamadosPortalShell({ view, mobile = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [refreshToken, setRefreshToken] = useState(0);
  const [selectedAssunto, setSelectedAssunto] = useState<ConversaAssuntoListItem | null>(null);
  const bumpRefresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  const onSelectAssunto = useCallback(
    (a: ConversaAssuntoListItem | null) => {
      setSelectedAssunto(a);
      const params = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : "",
      );
      if (a) params.set("conversa", a.slug);
      else params.delete("conversa");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("conversa")?.trim();
    if (!slug || selectedAssunto?.slug === slug) return;
    /** Só restaura da URL quando ainda não há seleção (evita corrida com clique). */
    if (selectedAssunto) return;
    let cancelled = false;
    void fetch(`/api/chamados/conversas?slug=${encodeURIComponent(slug)}`, {
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const raw = (data as { assunto?: Parameters<typeof assuntoFromApi>[0] })?.assunto;
        if (raw?.id) setSelectedAssunto(assuntoFromApi(raw));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname, selectedAssunto?.slug]);

  return (
    <div
      className={
        mobile ?
          "flex min-h-0 flex-col gap-3"
        : "portal-page flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      }
    >
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
      <div
        className={
          mobile ? undefined : (
            "portal-page-body flex min-h-0 flex-1 flex-col overflow-hidden !pb-4 !pt-3"
          )
        }
      >
        <Suspense
          fallback={
            <p className="text-sm text-slate-500">{mobile ? "Carregando IbiZap…" : "Carregando…"}</p>
          }
        >
          <ChamadosWorkspace
            view={view}
            mobile={mobile}
            refreshToken={refreshToken}
            selectedAssunto={selectedAssunto}
            onSelectAssunto={onSelectAssunto}
          />
        </Suspense>
      </div>
    </div>
  );
}
