"use client";

import { useEffect, useState } from "react";
import type { PastaEspecialView } from "@/lib/criacao/pastaEspecialService";

export function EscolherPastaEspecialModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (pastaEspecialId: string) => void | Promise<void>;
}) {
  const [pastas, setPastas] = useState<PastaEspecialView[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/criacao/pastas-especiais");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { pastas?: PastaEspecialView[] };
        setPastas(data.pastas ?? []);
      } catch {
        setErr("Não foi possível carregar as pastas especiais.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function pick(id: string) {
    setSubmitting(id);
    try {
      await onSelect(id);
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold">+ Especial</h2>
            <p className="text-xs text-slate-500">Escolha uma pasta especial para copiar nesta programação.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {loading ?
            <p className="py-8 text-center text-sm text-slate-500">Carregando…</p>
          : err ?
            <p className="py-8 text-center text-sm text-red-600">{err}</p>
          : pastas.length === 0 ?
            <div className="py-8 text-center text-sm text-slate-500">
              Nenhuma pasta especial cadastrada. Crie em{" "}
              <a href="/criacao/pastas-especiais" className="font-semibold text-violet-700 underline">
                Pastas Especiais
              </a>
              .
            </div>
          : <ul className="space-y-2">
              {pastas.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-violet-200 px-3 py-2 dark:border-violet-800"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{p.nome}</div>
                    <div className="text-[11px] text-slate-500">
                      {p.musicaCount} faixa(s)
                      {p.selecionavel ? " · selecionável no player" : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={submitting !== null}
                    onClick={() => void pick(p.id)}
                    className="shrink-0 rounded-lg bg-violet-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {submitting === p.id ? "Copiando…" : "Usar"}
                  </button>
                </li>
              ))}
            </ul>
          }
        </div>
      </div>
    </div>
  );
}
