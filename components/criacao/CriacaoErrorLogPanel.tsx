"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ErrorRow = {
  id: string;
  level: string;
  source: string;
  message: string;
  stack: string;
  path: string;
  method: string;
  status: number | null;
  userEmail: string;
  context: unknown;
  createdAt: string;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function CriacaoErrorLogPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [scope, setScope] = useState<"criacao" | "all">("criacao");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ pageSize: "100", scope });
    return params.toString();
  }, [scope]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/criacao/error-log?${queryString}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { logs: ErrorRow[]; total: number };
      setRows(data.logs);
      setTotal(data.total);
    } catch {
      setError("Não foi possível carregar o diagnóstico.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `criacao-diagnostico-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-[1100px] px-3 py-6 pb-24 sm:px-4">
      <div className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Criação / Diagnóstico</div>
        <h1 className="text-2xl font-bold tracking-tight">Log de erros</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Captura falhas de JavaScript, APIs do Criação e respostas de erro do cloud2 enquanto você testa.
          Exporte e me envie se algo quebrar.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Escopo</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "criacao" | "all")}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="criacao">Só Criação / cloud2</option>
            <option value="all">Todo o portal</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
        >
          Atualizar
        </button>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Auto (5s)
        </label>
        <button
          type="button"
          onClick={exportJson}
          disabled={rows.length === 0}
          className="ml-auto rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40 dark:border-slate-700"
        >
          Exportar JSON
        </button>
      </div>

      <div className="mb-2 text-xs text-slate-500">{total} registro{total === 1 ? "" : "s"}</div>

      {loading ?
        <div className="py-10 text-sm text-slate-500">Carregando…</div>
      : error ?
        <div className="py-10 text-sm text-red-600">{error}</div>
      : rows.length === 0 ?
        <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 px-4 py-12 text-center text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          Nenhum erro registrado. 🎉
        </div>
      : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((row) => {
              const open = expanded.has(row.id);
              return (
                <li key={row.id} className="px-4 py-3">
                  <button type="button" onClick={() => toggle(row.id)} className="flex w-full items-start gap-3 text-left">
                    <span className="w-[130px] shrink-0 text-xs tabular-nums text-slate-500">{formatWhen(row.createdAt)}</span>
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase dark:bg-slate-800">
                      {row.level}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{row.message}</span>
                      {row.path ?
                        <span className="block truncate font-mono text-[11px] text-slate-500">
                          {row.method ? `${row.method} ` : ""}
                          {row.path}
                          {row.status ? ` · ${row.status}` : ""}
                        </span>
                      : null}
                    </span>
                    <span className="text-xs text-slate-400">{open ? "▲" : "▼"}</span>
                  </button>
                  {open ?
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                      {row.stack ?
                        <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-[11px] dark:bg-slate-950">
                          {row.stack}
                        </pre>
                      : null}
                      {row.context && JSON.stringify(row.context) !== "{}" ?
                        <pre className="max-h-32 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-[11px] dark:bg-slate-950">
                          {JSON.stringify(row.context, null, 2)}
                        </pre>
                      : null}
                    </div>
                  : null}
                </li>
              );
            })}
          </ul>
        </div>
      }
    </div>
  );
}
