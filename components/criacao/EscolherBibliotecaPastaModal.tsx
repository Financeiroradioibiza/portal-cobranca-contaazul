"use client";

import { useEffect, useState } from "react";
import {
  iconeBibliotecaPastaEmoji,
  type BibliotecaPastaView,
} from "@/lib/criacao/bibliotecaPastaService";

function readableText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#1e293b" : "#ffffff";
}

export function EscolherBibliotecaPastaModal({
  title = "+ Custom",
  subtitle = "Escolha uma pasta custom da biblioteca.",
  promptPastaNome = false,
  onClose,
  onSelect,
}: {
  title?: string;
  subtitle?: string;
  /** Pede nome da pasta na programação (não usa só o nome da pasta custom). */
  promptPastaNome?: boolean;
  onClose: () => void;
  onSelect: (bibliotecaPastaId: string, pastaNome?: string) => void | Promise<void>;
}) {
  const [pastas, setPastas] = useState<BibliotecaPastaView[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [nomePasta, setNomePasta] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/criacao/biblioteca/pastas");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { pastas?: BibliotecaPastaView[] };
        setPastas(data.pastas ?? []);
      } catch {
        setErr("Não foi possível carregar as pastas custom.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function pick(id: string) {
    setSubmitting(id);
    try {
      const chosen = pastas.find((p) => p.id === id);
      const nome = promptPastaNome ?
        (nomePasta.trim() || chosen?.nome || "").trim()
      : undefined;
      await onSelect(id, nome);
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
            <h2 className="text-sm font-bold">{title}</h2>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        {promptPastaNome ?
          <div className="border-b border-slate-100 px-4 py-2 dark:border-slate-800">
            <label className="block text-xs font-semibold text-slate-500">
              Nome da pasta na programação
              <input
                value={nomePasta}
                onChange={(e) => setNomePasta(e.target.value)}
                placeholder="Ex.: Lounge tarde"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
          </div>
        : null}
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {loading ?
            <p className="py-8 text-center text-sm text-slate-500">Carregando…</p>
          : err ?
            <p className="py-8 text-center text-sm text-red-600">{err}</p>
          : pastas.length === 0 ?
            <div className="py-8 text-center text-sm text-slate-500">
              Nenhuma pasta custom ainda. Crie em{" "}
              <a href="/criacao/biblioteca" className="font-semibold text-violet-700 underline">
                Biblioteca musical
              </a>
              .
            </div>
          : <ul className="space-y-2">
              {pastas.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm"
                      style={{ backgroundColor: p.cor, color: readableText(p.cor) }}
                    >
                      {iconeBibliotecaPastaEmoji(p.icone)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{p.nome}</div>
                      <div className="truncate text-[11px] text-slate-500">
                        [{p.criativoIniciais}] {p.criativoNome} · {p.musicaCount} faixa
                        {p.musicaCount === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={submitting !== null || p.musicaCount === 0}
                    onClick={() => void pick(p.id)}
                    className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                    title={p.musicaCount === 0 ? "Pasta vazia" : undefined}
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
