"use client";

import { useCallback, useEffect, useState } from "react";

type LogRow = {
  id: string;
  userEmail: string;
  userDisplayName: string;
  action: string;
  method: string;
  path: string;
  query: string;
  ip: string;
  createdAt: string;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function methodTone(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
    case "POST":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
    case "PATCH":
    case "PUT":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
    case "DELETE":
      return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function ConfigLogsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");

  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) params.set("search", search.trim());
      if (userEmail.trim()) params.set("userEmail", userEmail.trim());

      const res = await fetch(`/api/config/audit-log?${params}`);
      if (!res.ok) throw new Error("load_failed");
      const data = (await res.json()) as { logs: LogRow[]; total: number };
      setLogs(data.logs);
      setTotal(data.total);
    } catch {
      setError("Não foi possível carregar os logs.");
    } finally {
      setLoading(false);
    }
  }, [page, search, userEmail]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchDraft);
    setUserEmail(emailDraft);
  }

  return (
    <div className="mx-auto max-w-[1200px] px-3 py-6 sm:px-4">
      <div className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Configuração / Logs
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Logs de atividade</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Registro do que cada usuário faz no painel: páginas visitadas, alterações e login.
        </p>
      </div>

      <form
        onSubmit={applyFilters}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <label className="min-w-[180px] flex-1 text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Buscar ação ou caminho</span>
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Ex.: Financeiro, cadastro, login"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
        <label className="min-w-[180px] flex-1 text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-500">E-mail do usuário</span>
          <input
            type="search"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            placeholder="filtrar por e-mail"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
        >
          Filtrar
        </button>
      </form>

      {loading ?
        <div className="py-10 text-sm text-slate-500">Carregando…</div>
      : error ?
        <div className="py-10 text-sm text-red-600">{error}</div>
      : logs.length === 0 ?
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-700">
          Nenhum registro ainda. As ações passam a aparecer conforme o time usa o portal.
        </div>
      : <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              {total} registro{total === 1 ? "" : "s"}
              {search || userEmail ? " (filtrado)" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 dark:border-slate-700"
              >
                Anterior
              </button>
              <span>
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 dark:border-slate-700"
              >
                Próxima
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="hidden grid-cols-[140px_1fr_1.2fr_100px_120px] gap-3 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800/50 lg:grid">
              <span>Quando</span>
              <span>Usuário</span>
              <span>Ação</span>
              <span>Método</span>
              <span>IP</span>
            </div>
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {logs.map((row) => (
                <li
                  key={row.id}
                  className="grid gap-2 px-4 py-3 lg:grid-cols-[140px_1fr_1.2fr_100px_120px] lg:items-center"
                >
                  <div className="text-xs tabular-nums text-slate-500">{formatWhen(row.createdAt)}</div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {row.userDisplayName || row.userEmail}
                    </div>
                    <div className="truncate text-xs text-slate-500">{row.userEmail}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{row.action}</div>
                    <div className="truncate font-mono text-[11px] text-slate-500">
                      {row.path}
                      {row.query}
                    </div>
                  </div>
                  <div>
                    <span
                      className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold uppercase ${methodTone(row.method)}`}
                    >
                      {row.method}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">{row.ip || "—"}</div>
                </li>
              ))}
            </ul>
          </div>
        </>
      }
    </div>
  );
}
