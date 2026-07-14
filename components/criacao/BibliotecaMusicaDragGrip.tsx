"use client";

import { useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { musicaDragId, musicaIdsForDrag } from "@/lib/criacao/bibliotecaFolderTypes";

export function BibliotecaMusicaDragGrip({
  musicaId,
  titulo,
  selectedIds,
}: {
  musicaId: string;
  titulo: string;
  selectedIds?: Set<string>;
}) {
  const musicaIds = useMemo(
    () => musicaIdsForDrag(musicaId, selectedIds),
    [musicaId, selectedIds],
  );

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: musicaDragId(musicaId),
    data: { musicaId, titulo, musicaIds },
  });

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing dark:hover:bg-slate-800 dark:hover:text-slate-200 ${
        isDragging ? "opacity-40" : ""
      }`}
      aria-label={`Arrastar ${titulo}`}
      title="Arrastar para pasta custom"
    >
      ⋮⋮
    </button>
  );
}
