"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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

type JobRow = {
  id: string;
  status: string;
  etapaAtual: string;
  titulo: string;
  totalItens: number;
  itensFeitos: number;
  duplicatas: number;
  erros: number;
  erroMsg: string;
  createdAt: string;
};

const POLL_HEADERS = { "X-Skip-Error-Report": "1" } as const;

const NOISE_MESSAGE_RE =
  /^Falha de rede em (GET|POST) \/api\/criacao\/(error-log|fila(\/sync-pending)?)/;

const ETAPA_LABEL: Record<string, string> = {
  upload: "Upload",
  deduplicacao: "Dedupe",
  ponto_mix: "Ponto de mix",
  normalizacao: "LUFS",
  tags: "Tags",
  armazenamento: "Armazenamento",
};

const JOB_STATUS_LABEL: Record<string, string> = {
  aguardando: "Aguardando",
  processando: "Processando",
  revisao: "Revisão",
  concluido: "Concluído",
  erro: "Erro",
  cancelado: "Cancelado",
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
 * Painel fixo sempre visível no rodapé do Criação (fase de testes).
 * Mostra fila de processamento ao vivo + erros capturados (JS, API, cloud2).
 */
export function CriacaoErrorDock() {
  const [minimized, setMinimized] = useState(false);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [errRes, filaRes] = await Promise.all([
        fetch("/api/criacao/error-log?pageSize=15", { headers: POLL_HEADERS }),
        fetch("/api/criacao/fila?limit=40", { headers: POLL_HEADERS }),
      ]);
      if (errRes.ok) {
        const data = (await errRes.json()) as { logs: ErrorRow[] };
        setErrors(
          (data.logs ?? []).filter(
            (r) => r.level !== "info" && !NOISE_MESSAGE_RE.test(r.message),
          ),
        );
      }
      if (filaRes.ok) {
        const data = (await filaRes.json()) as { jobs: JobRow[] };
        setJobs(data.jobs ?? []);
      }
      setLastCheck(new Date());
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    let timer: ReturnType<typeof setInterval> | null = null;

    const armTimer = () => {
      if (timer) clearInterval(timer);
      if (document.hidden) return;
      timer = setInterval(() => void load(), 8000);
    };

    armTimer();
    const onVisibility = () => {
      if (!document.hidden) void load();
      armTimer();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearInterval(timer);
    };
  }, [load]);

  const activeJobs = useMemo(
    () => jobs.filter((j) => j.status === "aguardando" || j.status === "processando" || j.status === "revisao"),
    [jobs],
  );
  const recentDone = useMemo(
    () => jobs.filter((j) => j.status === "concluido" || j.status === "erro").slice(0, 3),
    [jobs],
  );

  const errorCount = errors.filter((r) => r.level === "error").length;
  const warnCount = errors.filter((r) => r.level === "warn").length;
  const processing = activeJobs.some((j) => j.status === "processando");

  function exportJson() {
    const blob = new Blob(
      [JSON.stringify({ atualizado: new Date().toISOString(), jobs, errors }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `criacao-diagnostico-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 flex justify-center px-2 pb-2 sm:px-3 sm:pb-3"
      aria-live="polite"
    >
      <div className="pointer-events-auto w-full max-w-[960px] overflow-hidden rounded-xl border-2 border-slate-400/80 bg-white shadow-2xl dark:border-slate-600 dark:bg-slate-900">
        {/* Cabeçalho — sempre visível */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/80 sm:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {processing ? "⏳" : "🔍"} Diagnóstico ao vivo
            </span>
            {processing ?
              <span className="animate-pulse rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white">
                processando…
              </span>
            : activeJobs.length > 0 ?
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {activeJobs.length} na fila
              </span>
            : null}
            {errorCount > 0 ?
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                {errorCount} erro{errorCount === 1 ? "" : "s"}
              </span>
            : !processing && warnCount > 0 ?
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {warnCount} aviso{warnCount === 1 ? "" : "s"}
              </span>
            : !processing && activeJobs.length === 0 ?
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">ocioso</span>
            : null}
            {loading ?
              <span className="text-[10px] text-slate-400">↻</span>
            : lastCheck ?
              <span className="hidden text-[10px] text-slate-400 sm:inline">{formatWhen(lastCheck.toISOString())}</span>
            : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => setMinimized((v) => !v)}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              {minimized ? "▲ abrir" : "▼ minimizar"}
            </button>
          </div>
        </div>

        {!minimized ?
          <div className="grid max-h-[min(42vh,300px)] grid-cols-1 divide-y divide-slate-200 dark:divide-slate-800 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            {/* Coluna: processamento */}
            <div className="flex min-h-0 flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Fila de processamento
                </span>
                <Link href="/criacao/fila" className="text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                  abrir fila →
                </Link>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {activeJobs.length === 0 && recentDone.length === 0 ?
                  <div className="px-3 py-4 text-center text-[11px] text-slate-400">
                    Nenhum job ativo. Faça um upload para ver o processamento aqui.
                  </div>
                : <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeJobs.map((j) => {
                      const pct = j.totalItens > 0 ? Math.round((j.itensFeitos / j.totalItens) * 100) : 0;
                      return (
                        <li key={j.id} className="px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                              {j.titulo || "Upload"}
                            </span>
                            <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                              {JOB_STATUS_LABEL[j.status] ?? j.status}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                            <span>{ETAPA_LABEL[j.etapaAtual] ?? j.etapaAtual}</span>
                            <span>·</span>
                            <span>
                              {j.itensFeitos}/{j.totalItens} faixas
                            </span>
                            {j.duplicatas > 0 ?
                              <span className="text-amber-600">· {j.duplicatas} dup</span>
                            : null}
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                            <div
                              className="h-full rounded-full bg-sky-500 transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {j.erroMsg ?
                            <div className="mt-1 truncate text-[10px] text-red-600">{j.erroMsg}</div>
                          : null}
                        </li>
                      );
                    })}
                    {recentDone.map((j) => (
                      <li key={j.id} className="px-3 py-1.5 opacity-70">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="truncate text-slate-600 dark:text-slate-400">{j.titulo}</span>
                          <span
                            className={
                              j.status === "erro" ? "font-bold text-red-600" : "font-bold text-emerald-600"
                            }
                          >
                            {JOB_STATUS_LABEL[j.status] ?? j.status}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                }
              </div>
            </div>

            {/* Coluna: erros */}
            <div className="flex min-h-0 flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Erros e avisos</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={exportJson}
                    className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    exportar
                  </button>
                  <Link href="/criacao/erros" className="text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                    ver tudo →
                  </Link>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {errors.length === 0 ?
                  <div className="px-3 py-4 text-center text-[11px] text-emerald-600 dark:text-emerald-400">
                    Sem erros recentes ✓
                  </div>
                : <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {errors.map((r) => (
                      <li key={r.id} className="px-3 py-1.5">
                        <div className="flex items-start gap-2 text-[11px]">
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
              </div>
            </div>
          </div>
        : null}

        {!minimized ?
          <p className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-900">
            Atualiza a cada 8 segundos · exporte e me envie se algo falhar
          </p>
        : null}
      </div>
    </div>
  );
}
