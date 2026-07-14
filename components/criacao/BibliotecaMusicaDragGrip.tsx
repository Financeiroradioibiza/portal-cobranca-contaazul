"use client";

import { useDraggable } from "@dnd-kit/core";
import { musicaDragId } from "@/lib/criacao/bibliotecaFolderTypes";

export function BibliotecaMusicaDragGrip({
  musicaId,
  titulo,
}: {
  musicaId: string;
  titulo: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: musicaDragId(musicaId),
    data: { musicaId, titulo },
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
