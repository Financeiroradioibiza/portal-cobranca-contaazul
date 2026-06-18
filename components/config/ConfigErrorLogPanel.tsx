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
  userAgent: string;
  context: unknown;
  createdAt: string;
};

const LEVELS = ["all", "error", "warn", "info"] as const;
const SOURCES = ["all", "client", "render", "api", "server"] as const;

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

function levelTone(level: string): string {
  switch (level) {
    case "error":
      return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
    case "warn":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  }
}

function sourceTone(source: string): string {
  switch (source) {
    case "client":
      return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200";
    case "render":
      return "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200";
    case "api":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
    case "server":
      return "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function ConfigErrorLogPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [level, setLevel] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [clearing, setClearing] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ pageSize: "200" });
    if (level !== "all") params.set("level", level);
    if (source !== "all") params.set("source", source);
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [level, source, search]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/config/error-log?${queryString}`);
      if (!res.ok) throw new Error("load_failed");
      const data = (await res.json()) as { logs: ErrorRow[]; total: number };
      setRows(data.logs);
      setTotal(data.total);
    } catch {
      setError("Não foi possível carregar os erros.");
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
    const t = setInterval(() => void load(), 8000);
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
    a.download = `portal-erros-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const params = new URLSearchParams(queryString);
    params.set("format", "csv");
    window.open(`/api/config/error-log?${params}`, "_blank");
  }

  async function clearAll() {
    if (!window.confirm("Apagar TODOS os erros registrados? Esta ação não pode ser desfeita.")) return;
    setClearing(true);
    try {
      const res = await fetch("/api/config/error-log", { method: "DELETE" });
      if (!res.ok) throw new Error("clear_failed");
      await load();
    } catch {
      setError("Não foi possível limpar os erros.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] px-3 py-6 sm:px-4">
      <div className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Configuração / Erros
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Erros do portal</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Captura falhas de tela (JavaScript), de renderização e de API. Útil principalmente nesta
          fase de desenvolvimento — exporte e me mande para diagnóstico.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Nível</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm capitalize dark:border-slate-700 dark:bg-slate-950"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l === "all" ? "Todos" : l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Origem</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm capitalize dark:border-slate-700 dark:bg-slate-950"
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "Todas" : s}
              </option>
            ))}
          </select>
        </label>
        <form
          className="min-w-[200px] flex-1 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchDraft);
          }}
        >
          <span className="mb-1 block text-xs font-semibold text-slate-500">Buscar mensagem / rota / usuário</span>
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Ex.: 500, undefined, /criacao"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </form>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
        >
          Atualizar
        </button>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto (8s)
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-500">
          {total} erro{total === 1 ? "" : "s"}
          {level !== "all" || source !== "all" || search ? " (filtrado)" : ""}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportJson}
            disabled={rows.length === 0}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-40 dark:border-slate-700"
          >
            Exportar JSON
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-40 dark:border-slate-700"
          >
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={() => void clearAll()}
            disabled={clearing || total === 0}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-300"
          >
            {clearing ? "Limpando…" : "Limpar tudo"}
          </button>
        </div>
      </div>

      {loading ?
        <div className="py-10 text-sm text-slate-500">Carregando…</div>
      : error ?
        <div className="py-10 text-sm text-red-600">{error}</div>
      : rows.length === 0 ?
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-700">
          Nenhum erro registrado. 🎉
        </div>
      : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((row) => {
              const open = expanded.has(row.id);
              return (
                <li key={row.id} className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggle(row.id)}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <span className="mt-0.5 w-[120px] shrink-0 text-xs tabular-nums text-slate-500">
                      {formatWhen(row.createdAt)}
                    </span>
                    <span
                      className={`mt-0.5 inline-flex shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase ${levelTone(row.level)}`}
                    >
                      {row.level}
                    </span>
                    <span
                      className={`mt-0.5 inline-flex shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase ${sourceTone(row.source)}`}
                    >
                      {row.source}
                      {row.status ? ` ${row.status}` : ""}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {row.message}
                      </span>
                      {row.path ?
                        <span className="block truncate font-mono text-[11px] text-slate-500">
                          {row.method ? `${row.method} ` : ""}
                          {row.path}
                        </span>
                      : null}
                    </span>
                    <span className="mt-0.5 shrink-0 text-xs text-slate-400">{open ? "▲" : "▼"}</span>
                  </button>

                  {open ?
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                      {row.userEmail ?
                        <div className="text-xs text-slate-500">
                          Usuário: <span className="font-medium">{row.userEmail}</span>
                        </div>
                      : null}
                      {row.stack ?
                        <div>
                          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Stack
                          </div>
                          <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-[11px] text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                            {row.stack}
                          </pre>
                        </div>
                      : null}
                      {row.context && JSON.stringify(row.context) !== "{}" ?
                        <div>
                          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Contexto
                          </div>
                          <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-[11px] text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                            {JSON.stringify(row.context, null, 2)}
                          </pre>
                        </div>
                      : null}
                      {row.userAgent ?
                        <div className="truncate text-[11px] text-slate-400">{row.userAgent}</div>
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
