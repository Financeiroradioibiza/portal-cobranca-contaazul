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
} from "@/lib/criacao/bibliotecaFolderTypes";
import { iconeBibliotecaPastaEmoji } from "@/lib/criacao/bibliotecaPastaService";

function SelectionDragHandle({
  count,
  label,
}: {
  count: number;
  label: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: BIBLIOTECA_DRAG_MUSICAS,
    disabled: count === 0,
    data: { count },
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
  const [sidebarKey, setSidebarKey] = useState(0);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [panelRefresh, setPanelRefresh] = useState(0);
  const [dragOverlayLabel, setDragOverlayLabel] = useState<string | null>(null);
  const musicasOrderRef = useRef<string[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onToggleSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shiftKey && anchorId && musicasOrderRef.current.length > 0) {
          const order = musicasOrderRef.current;
          const a = order.indexOf(anchorId);
          const b = order.indexOf(id);
          if (a >= 0 && b >= 0) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (let i = lo; i <= hi; i++) next.add(order[i]);
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
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
      const ids = resolveMusicaIdsFromDrag(ev.active.id, selectedIds);
      if (!paraId || ids.length === 0) return;

      const dePastaId = folder.kind === "custom" ? folder.id : null;
      try {
        const res = await fetch("/api/criacao/biblioteca/pastas/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dePastaId,
            paraPastaId: paraId,
            musicaIds: ids,
          }),
        });
        if (!res.ok) throw new Error();
        setSelectedIds(new Set());
        setSidebarKey((k) => k + 1);
        setPanelRefresh((k) => k + 1);
      } catch {
        window.alert("Não foi possível adicionar as faixas na pasta.");
      }
    },
    [folder, selectedIds],
  );

  const onDragStart = useCallback(
    (ev: DragStartEvent) => {
      if (ev.active.id === BIBLIOTECA_DRAG_MUSICAS) {
        setDragOverlayLabel(`${selectedIds.size} faixa${selectedIds.size === 1 ? "" : "s"}`);
        return;
      }
      const ids = resolveMusicaIdsFromDrag(ev.active.id, selectedIds);
      const titulo = (ev.active.data.current as { titulo?: string } | undefined)?.titulo?.trim();
      setDragOverlayLabel(
        ids.length > 1 ? `${ids.length} faixas` : titulo || "1 faixa",
      );
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
          key={sidebarKey}
          active={folder}
          onSelect={(f) => {
            setFolder(f);
            setSelectedIds(new Set());
          }}
          onPastasChange={() => setSidebarKey((k) => k + 1)}
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
            <SelectionDragHandle count={selectedIds.size} label={folder.label} />
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
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <BibliotecaMusicalPanel
              sidebarMode
              folderFilter={folderKeyToQuery(folder)}
              folderKind={folder.kind}
              folderTitle={folder.label}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              dragMusicaEnabled
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onMusicasLoaded={(ids) => {
                musicasOrderRef.current = ids;
              }}
              refreshToken={panelRefresh}
            />
          </div>
        </div>
      </div>

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
