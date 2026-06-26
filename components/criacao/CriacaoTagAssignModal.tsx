"use client";

import { useState } from "react";

export type CriacaoTagOption = { id: string; nome: string; cor: string };

function readableText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1e293b" : "#ffffff";
}

export function CriacaoTagAssignModal({
  musicaId,
  titulo,
  artista,
  assignedIds,
  tags,
  onClose,
  onChanged,
}: {
  musicaId: string;
  titulo: string;
  artista: string;
  assignedIds: string[];
  tags: CriacaoTagOption[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [assigned, setAssigned] = useState<Set<string>>(() => new Set(assignedIds));
  const [busy, setBusy] = useState(false);

  async function toggle(tagId: string) {
    if (busy) return;
    setBusy(true);
    const has = assigned.has(tagId);
    try {
      if (has) {
        await fetch(`/api/criacao/musicas/${musicaId}/tags/${tagId}`, { method: "DELETE" });
        setAssigned((prev) => {
          const n = new Set(prev);
          n.delete(tagId);
          return n;
        });
      } else {
        await fetch(`/api/criacao/musicas/${musicaId}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagId }),
        });
        setAssigned((prev) => new Set(prev).add(tagId));
      }
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{titulo || "(sem título)"}</div>
            <div className="truncate text-xs text-slate-500">{artista}</div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <div className="p-4">
          <p className="mb-3 text-xs text-slate-500">Toque para ligar ou desligar tags criativas desta faixa.</p>
          {tags.length === 0 ?
            <div className="text-sm text-slate-400">Nenhuma tag criada. Crie tags na Biblioteca musical.</div>
          : <div className="flex flex-wrap gap-2">
              {tags.map((t) => {
                const on = assigned.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void toggle(t.id)}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition disabled:opacity-50 ${on ? "" : "opacity-40 grayscale hover:opacity-70"}`}
                    style={{ background: t.cor, color: readableText(t.cor) }}
                  >
                    {on ? "✓ " : ""}
                    {t.nome}
                  </button>
                );
              })}
            </div>
          }
        </div>
      </div>
    </div>
  );
}
