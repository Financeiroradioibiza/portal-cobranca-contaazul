"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ErrorRow = {
  id: string;
  level: string;
  source: string;
  message: string;
  path: string;
  method: string;
  status: number | null;
  createdAt: string;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function levelClass(level: string): string {
  if (level === "error") return "text-red-600 dark:text-red-400";
  if (level === "warn") return "text-amber-600 dark:text-amber-400";
  return "text-slate-500";
}

/**
 * Box fixo no rodapé do módulo Criação — mostra erros capturados em tempo quase real
 * (JavaScript, API, render). Atualiza a cada 5s enquanto expandido ou com badge.
 */
export function CriacaoErrorDock() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/criacao/error-log?pageSize=20");
      if (!res.ok) return;
      const data = (await res.json()) as { logs: ErrorRow[] };
      setRows(data.logs ?? []);
      setLastCheck(new Date());
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  const errorCount = rows.filter((r) => r.level === "error").length;
  const warnCount = rows.filter((r) => r.level === "warn").length;

  function exportJson() {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `criacao-erros-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 flex justify-center px-3 pb-3 lg:pl-[var(--portal-sidebar-w,0px)]"
      aria-live="polite"
    >
      <div className="pointer-events-auto w-full max-w-[900px] overflow-hidden rounded-xl border border-slate-300 bg-white/95 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/80"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">🔍 Diagnóstico</span>
            {errorCount > 0 ?
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                {errorCount} erro{errorCount === 1 ? "" : "s"}
              </span>
            : warnCount > 0 ?
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {warnCount} aviso{warnCount === 1 ? "" : "s"}
              </span>
            : <span className="text-xs text-emerald-600 dark:text-emerald-400">sem erros recentes</span>}
            {loading ?
              <span className="text-[10px] text-slate-400">atualizando…</span>
            : lastCheck ?
              <span className="hidden text-[10px] text-slate-400 sm:inline">
                checado {formatWhen(lastCheck.toISOString())}
              </span>
            : null}
          </div>
          <span className="shrink-0 text-xs text-slate-400">{open ? "▼ minimizar" : "▲ expandir"}</span>
        </button>

        {open ?
          <div className="border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-end gap-2 border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
              <button
                type="button"
                onClick={() => void load()}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Atualizar
              </button>
              <button
                type="button"
                onClick={exportJson}
                disabled={rows.length === 0}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-40 dark:hover:text-slate-200"
              >
                Exportar JSON
              </button>
              <Link
                href="/criacao/erros"
                className="text-[11px] font-semibold text-sky-600 hover:text-sky-800 dark:text-sky-400"
              >
                Ver tudo →
              </Link>
            </div>
            {rows.length === 0 ?
              <div className="px-4 py-6 text-center text-xs text-slate-400">
                Nenhum erro registrado no Criação ainda. Falhas de upload, API e JavaScript aparecem aqui
                automaticamente.
              </div>
            : <ul className="max-h-52 overflow-auto divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => (
                  <li key={r.id} className="px-4 py-2">
                    <div className="flex items-start gap-2 text-xs">
                      <span className="shrink-0 tabular-nums text-slate-400">{formatWhen(r.createdAt)}</span>
                      <span className={`shrink-0 font-bold uppercase ${levelClass(r.level)}`}>{r.level}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-800 dark:text-slate-100">
                          {r.message}
                        </span>
                        {r.path ?
                          <span className="block truncate font-mono text-[10px] text-slate-400">
                            {r.method ? `${r.method} ` : ""}
                            {r.path}
                            {r.status ? ` (${r.status})` : ""}
                          </span>
                        : null}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            }
            <p className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400 dark:border-slate-800">
              Atualiza a cada 5 segundos. Exporte e me envie se algo falhar durante os testes.
            </p>
          </div>
        : null}
      </div>
    </div>
  );
}
