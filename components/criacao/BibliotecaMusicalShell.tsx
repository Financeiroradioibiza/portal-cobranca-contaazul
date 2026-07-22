"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { BibliotecaMusicalPanel } from "@/components/criacao/BibliotecaMusicalPanel";
import { BibliotecaSidebar } from "@/components/criacao/BibliotecaSidebar";
import { CopiarParaProgramacaoModal } from "@/components/criacao/CopiarParaProgramacaoModal";
import {
  BIBLIOTECA_DRAG_MUSICAS,
  folderKeyToQuery,
  parseFolderDropTargetId,
  resolveMusicaIdsFromDrag,
  type BibliotecaFolderKey,
  type BibliotecaMusicaDragData,
} from "@/lib/criacao/bibliotecaFolderTypes";
import { iconeBibliotecaPastaEmoji } from "@/lib/criacao/bibliotecaPastaService";

function SelectionDragHandle({
  count,
  label,
  musicaIds,
}: {
  count: number;
  label: string;
  musicaIds: string[];
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: BIBLIOTECA_DRAG_MUSICAS,
    disabled: count === 0,
    data: { count, musicaIds },
  });

  if (count === 0) return null;

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 active:cursor-grabbing dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100 ${
        isDragging ? "opacity-50" : ""
      }`}
      title="Arraste para uma pasta custom na barra lateral"
    >
      ⋮⋮ Arrastar {count} faixa{count === 1 ? "" : "s"} ({label})
    </button>
  );
}

type ViewMode = "full" | "slim";

export function BibliotecaMusicalShell() {
  const [folder, setFolder] = useState<BibliotecaFolderKey>({ kind: "all", label: "Biblioteca" });
  const [viewMode, setViewMode] = useState<ViewMode>("slim");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [sidebarRefresh, setSidebarRefresh] = useState(0);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [panelRefresh, setPanelRefresh] = useState(0);
  const [removePatch, setRemovePatch] = useState<{ token: number; ids: string[] } | null>(null);
  const [dragOverlayLabel, setDragOverlayLabel] = useState<string | null>(null);
  const [moveToast, setMoveToast] = useState<string | null>(null);
  const musicasOrderRef = useRef<string[]>([]);
  const panelScrollRef = useRef<HTMLDivElement>(null);
  const panelScrollTopRef = useRef(0);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onToggleSelect = useCallback(
    (id: string, shiftKey: boolean, metaKey = false) => {
      setSelectedIds((prev) => {
        if (shiftKey && anchorId && musicasOrderRef.current.length > 0) {
          const order = musicasOrderRef.current;
          const a = order.indexOf(anchorId);
          const b = order.indexOf(id);
          if (a >= 0 && b >= 0) {
            const next = metaKey ? new Set(prev) : new Set<string>();
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (let i = lo; i <= hi; i++) next.add(order[i]);
            return next;
          }
        }
        if (metaKey) {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }
        if (prev.size === 1 && prev.has(id)) return new Set();
        return new Set([id]);
      });
      setAnchorId(id);
    },
    [anchorId],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        const t = e.target as HTMLElement | null;
        if (t?.closest("input, textarea, select")) return;
        e.preventDefault();
        setSelectedIds(new Set(musicasOrderRef.current));
      }
      if (e.key === "Escape") setSelectedIds(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onDragEnd = useCallback(
    async (ev: DragEndEvent) => {
      setDragOverlayLabel(null);
      const paraId = parseFolderDropTargetId(String(ev.over?.id ?? ""));
      const dragData = ev.active.data.current as BibliotecaMusicaDragData | undefined;
      const ids = resolveMusicaIdsFromDrag(ev.active.id, dragData, selectedIds);
      if (!paraId || ids.length === 0) return;

      const dePastaId = folder.kind === "custom" ? folder.id : null;
      panelScrollTopRef.current = panelScrollRef.current?.scrollTop ?? 0;

      const MOVE_CLIENT_CHUNK = 80;
      try {
        for (let i = 0; i < ids.length; i += MOVE_CLIENT_CHUNK) {
          const chunk = ids.slice(i, i + MOVE_CLIENT_CHUNK);
          const res = await fetch("/api/criacao/biblioteca/pastas/move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dePastaId,
              paraPastaId: paraId,
              musicaIds: chunk,
            }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? `HTTP ${res.status}`);
          }
        }
        setSelectedIds(new Set());
        setSidebarRefresh((k) => k + 1);
        if (dePastaId && dePastaId !== paraId) {
          setRemovePatch({ token: Date.now(), ids });
        }
        setMoveToast(
          ids.length === 1 ?
            "Faixa adicionada à pasta"
          : `${ids.length} faixas adicionadas à pasta`,
        );
      } catch (e) {
        setPanelRefresh((k) => k + 1);
        setSidebarRefresh((k) => k + 1);
        const detail = e instanceof Error && e.message ? `\n\n(${e.message})` : "";
        window.alert(`Não foi possível adicionar as faixas na pasta.${detail}`);
      }
    },
    [folder, selectedIds],
  );

  useEffect(() => {
    if (!moveToast) return;
    const t = setTimeout(() => setMoveToast(null), 2200);
    return () => clearTimeout(t);
  }, [moveToast]);

  useEffect(() => {
    if (removePatch == null) return;
    requestAnimationFrame(() => {
      if (panelScrollRef.current) {
        panelScrollRef.current.scrollTop = panelScrollTopRef.current;
      }
    });
  }, [removePatch?.token]);

  const onDragStart = useCallback(
    (ev: DragStartEvent) => {
      const dragData = ev.active.data.current as BibliotecaMusicaDragData | undefined;
      const ids = resolveMusicaIdsFromDrag(ev.active.id, dragData, selectedIds);
      if (ev.active.id === BIBLIOTECA_DRAG_MUSICAS || ids.length > 1) {
        setDragOverlayLabel(`${ids.length} faixa${ids.length === 1 ? "" : "s"}`);
        return;
      }
      const titulo = dragData?.titulo?.trim();
      setDragOverlayLabel(titulo || "1 faixa");
    },
    [selectedIds],
  );

  const folderSubtitle =
    folder.kind === "prog" ? `${folder.clienteNome} · ${folder.programacaoNome}`
    : folder.kind === "custom" ? `[${folder.criativoIniciais}] ${folder.label}`
    : folder.kind === "tag" && folder.criativoNome ? `[${folder.criativoNome}]`
    : undefined;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={(e) => void onDragEnd(e)}
      onDragCancel={() => setDragOverlayLabel(null)}
    >
      <div className="flex h-[calc(100vh-4rem)] min-h-[480px] overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <BibliotecaSidebar
          active={folder}
          refreshToken={sidebarRefresh}
          onSelect={(f) => {
            setFolder(f);
            setSelectedIds(new Set());
          }}
          onPastasChange={() => setSidebarRefresh((k) => k + 1)}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold text-slate-900 dark:text-slate-100">
                {folder.kind === "custom" ?
                  `${iconeBibliotecaPastaEmoji(folder.icone)} ${folder.label}`
                : folder.label}
              </h1>
              {folderSubtitle ?
                <p className="truncate text-xs text-slate-500">{folderSubtitle}</p>
              : null}
              {(folder.kind === "prog" || folder.kind === "especial") ?
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                  Somente leitura — selecione e copie para pastas custom ou programação
                </p>
              : folder.kind !== "custom" ?
                <p className="text-[10px] text-slate-400">
                  Clique na faixa para selecionar · Shift+clique intervalo · ⌘/Ctrl+A todas
                </p>
              : null}
            </div>
            <div
              className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700"
              role="group"
              aria-label="Modo de listagem"
            >
              <button
                type="button"
                onClick={() => setViewMode("full")}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  viewMode === "full" ?
                    "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300"
                }`}
              >
                Completa
              </button>
              <button
                type="button"
                onClick={() => setViewMode("slim")}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  viewMode === "slim" ?
                    "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300"
                }`}
              >
                Slim
              </button>
            </div>
            <SelectionDragHandle
              count={selectedIds.size}
              label={folder.label}
              musicaIds={Array.from(selectedIds)}
            />
            {selectedIds.size > 0 ?
              <>
                <button
                  type="button"
                  onClick={() => setShowCopyModal(true)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
                >
                  Copiar p/ programação ({selectedIds.size})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-slate-500 underline"
                >
                  Limpar seleção
                </button>
              </>
            : null}
          </div>
          <div ref={panelScrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
            <BibliotecaMusicalPanel
              sidebarMode
              folderFilter={folderKeyToQuery(folder)}
              folderKind={folder.kind}
              folderTitle={folder.label}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              dragMusicaEnabled
              selectedIds={selectedIds}
              onToggleSelect={(id, shiftKey, metaKey) => onToggleSelect(id, shiftKey, metaKey)}
              onMusicasLoaded={(ids) => {
                musicasOrderRef.current = ids;
              }}
              refreshToken={panelRefresh}
              removePatch={removePatch}
            />
          </div>
        </div>
      </div>

      {moveToast ?
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
          {moveToast}
        </div>
      : null}

      <DragOverlay>
        {dragOverlayLabel ?
          <div className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-lg">
            {dragOverlayLabel}
          </div>
        : null}
      </DragOverlay>

      {showCopyModal ?
        <CopiarParaProgramacaoModal
          musicaIds={Array.from(selectedIds)}
          onClose={() => setShowCopyModal(false)}
          onDone={() => setSelectedIds(new Set())}
        />
      : null}
    </DndContext>
  );
}
