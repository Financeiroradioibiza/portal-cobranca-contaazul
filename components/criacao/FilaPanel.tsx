"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FilaJobKanban } from "@/components/criacao/FilaJobKanban";
import { FilaRevisaoWorkflow } from "@/components/criacao/FilaRevisaoWorkflow";
import { ETAPA_LABEL } from "@/lib/criacao/filaKanban";

type JobRow = {
  id: string;
  tipo: string;
  status: string;
  etapaAtual: string;
  titulo: string;
  clienteNome: string;
  criativoNome: string;
  totalItens: number;
  itensFeitos: number;
  duplicatas: number;
  erros: number;
  erroMsg: string;
  createdAt: string;
};

type JobItem = {
  id: string;
  arquivoNome: string;
  status: string;
  etapaAtual?: string;
  musicaId: string | null;
  duplicataDeId: string | null;
  erroMsg: string;
};

const ETAPA_LABEL_UI: Record<string, string> = ETAPA_LABEL;

const STATUS_TONE: Record<string, string> = {
  aguardando: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  processando: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  revisao: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  concluido: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  erro: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  cancelado: "bg-slate-100 text-slate-500 line-through dark:bg-slate-800",
  duplicata: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

const STATUS_LABEL: Record<string, string> = {
  aguardando: "Aguardando",
  processando: "Processando",
  revisao: "Revisão",
  concluido: "Concluído",
  erro: "Erro",
  cancelado: "Cancelado",
  duplicata: "Duplicata",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type JobDetailMeta = {
  titulo: string;
  clienteNome: string;
  uploadTagNome: string;
  pastaNome: string;
  programacaoNome: string;
};

export function FilaPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [status, setStatus] = useState("all");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, JobItem[]>>({});
  const [jobMeta, setJobMeta] = useState<Record<string, JobDetailMeta>>({});
  const [itemView, setItemView] = useState<"kanban" | "lista">("kanban");
  const lastSyncPendingAt = useRef(0);

  const syncPending = useCallback(async () => {
    const now = Date.now();
    if (now - lastSyncPendingAt.current < 25_000) return;
    lastSyncPendingAt.current = now;
    try {
      await fetch("/api/criacao/fila/sync-pending", { method: "POST" });
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/criacao/fila?${params}`);
      if (!res.ok) throw new Error("load_failed");
      const data = (await res.json()) as { jobs: JobRow[] };
      setJobs(data.jobs);
    } catch {
      setError("Não foi possível carregar a fila.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  const loadItems = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/criacao/fila/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        job: {
          itens: JobItem[];
          titulo: string;
          clienteNome: string;
          uploadTagNome: string;
          pastaNome: string;
          programacaoNome: string;
        };
      };
      setItems((prev) => ({ ...prev, [id]: data.job.itens }));
      setJobMeta((prev) => ({
        ...prev,
        [id]: {
          titulo: data.job.titulo,
          clienteNome: data.job.clienteNome,
          uploadTagNome: data.job.uploadTagNome,
          pastaNome: data.job.pastaNome,
          programacaoNome: data.job.programacaoNome,
        },
      }));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void syncPending();
    void load();
  }, [load, syncPending]);

  useEffect(() => {
    if (!autoRefresh && !openId) return;
    const t = setInterval(() => {
      void syncPending();
      void load();
      if (openId) void loadItems(openId);
    }, 4000);
    return () => clearInterval(t);
  }, [autoRefresh, openId, load, loadItems, syncPending]);

  function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
    } else {
      setOpenId(id);
      if (!items[id]) void loadItems(id);
    }
  }

  async function cancel(id: string) {
    if (!window.confirm("Cancelar este job?")) return;
    await fetch(`/api/criacao/fila/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    await load();
  }

  async function resolve(jobId: string, itemId: string, decision: "nova" | "existente") {
    await fetch(`/api/criacao/fila/item/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    lastSyncPendingAt.current = 0;
    await syncPending();
    await loadItems(jobId);
    await load();
  }

  return (
    <div className="mx-auto max-w-[1200px] px-3 py-6 sm:px-4">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Criação / Fila de processamento
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Fila de processamento</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Cada pasta ou tag vira um job na fila. Após o processamento automático, revise duplicatas,
            mix/trim e tags antes de aprovar e publicar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="all">Todos</option>
            <option value="aguardando">Aguardando</option>
            <option value="processando">Processando</option>
            <option value="revisao">Revisão</option>
            <option value="concluido">Concluído</option>
            <option value="erro">Erro</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
          >
            Atualizar
          </button>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto (5s)
          </label>
        </div>
      </div>

      {loading ?
        <div className="py-10 text-sm text-slate-500">Carregando…</div>
      : error ?
        <div className="py-10 text-sm text-red-600">{error}</div>
      : jobs.length === 0 ?
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-16 text-center text-sm text-slate-500 dark:border-slate-700">
          Nenhum job na fila. Envie músicas em <strong>Upload</strong> para começar.
        </div>
      : <ul className="space-y-3">
          {jobs.map((j) => {
            const open = openId === j.id;
            const pct = j.totalItens > 0 ? Math.round((j.itensFeitos / j.totalItens) * 100) : 0;
            const ativo = j.status === "aguardando" || j.status === "processando" || j.status === "revisao";
            return (
              <li
                key={j.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button type="button" onClick={() => toggle(j.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="text-slate-400">{open ? "▲" : "▼"}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{j.titulo}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {j.clienteNome || "sem cliente"} · {j.criativoNome || "—"} · {formatWhen(j.createdAt)}
                      </span>
                    </span>
                  </button>

                  <span className={`inline-flex shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_TONE[j.status] ?? ""}`}>
                    {STATUS_LABEL[j.status] ?? j.status}
                  </span>
                  {j.duplicatas > 0 ?
                    <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      ⚠ {j.duplicatas} duplicata{j.duplicatas === 1 ? "" : "s"}
                    </span>
                  : null}
                  {j.erros > 0 ?
                    <span className="shrink-0 rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800 dark:bg-red-950 dark:text-red-200">
                      {j.erros} erro{j.erros === 1 ? "" : "s"}
                    </span>
                  : null}

                  <div className="flex w-40 shrink-0 items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-slate-900 dark:bg-slate-100" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] tabular-nums text-slate-500">
                      {j.itensFeitos}/{j.totalItens}
                    </span>
                  </div>

                  {ativo ?
                    <button
                      type="button"
                      onClick={() => void cancel(j.id)}
                      className="shrink-0 rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:text-red-600 dark:border-slate-700"
                    >
                      Cancelar
                    </button>
                  : null}
                </div>

                {open ?
                  <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
                    {j.status === "revisao" && items[j.id] && jobMeta[j.id] ?
                      <FilaRevisaoWorkflow
                        jobId={j.id}
                        items={items[j.id]!}
                        jobMeta={jobMeta[j.id]!}
                        onResolveDuplicata={async (itemId, decision) => {
                          await resolve(j.id, itemId, decision);
                        }}
                        onApproved={() => {
                          lastSyncPendingAt.current = 0;
                          void syncPending();
                          void load();
                          void loadItems(j.id);
                        }}
                      />
                    : <>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(ETAPA_LABEL_UI).map(([key, label]) => (
                          <span
                            key={key}
                            className={
                              "rounded px-2 py-0.5 text-[10px] font-semibold " +
                              (key === j.etapaAtual
                                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                                : "bg-slate-200 text-slate-500 dark:bg-slate-800")
                            }
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                      <div className="flex rounded-lg border border-slate-200 p-0.5 text-[10px] font-semibold dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => setItemView("kanban")}
                          className={
                            "rounded-md px-2 py-1 " +
                            (itemView === "kanban"
                              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                              : "text-slate-500")
                          }
                        >
                          Kanban
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemView("lista")}
                          className={
                            "rounded-md px-2 py-1 " +
                            (itemView === "lista"
                              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                              : "text-slate-500")
                          }
                        >
                          Lista
                        </button>
                      </div>
                    </div>

                    {!items[j.id] ?
                      <div className="text-xs text-slate-400">Carregando itens…</div>
                    : items[j.id]!.length === 0 ?
                      <div className="text-xs text-slate-400">Sem itens.</div>
                    : itemView === "kanban" ?
                      <FilaJobKanban
                        jobId={j.id}
                        jobEtapaAtual={j.etapaAtual}
                        items={items[j.id]!}
                        onResolveDuplicata={(itemId, decision) => void resolve(j.id, itemId, decision)}
                      />
                    : <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {items[j.id]!.map((it) => (
                          <li key={it.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                            <span className="min-w-0 flex-1 truncate">{it.arquivoNome}</span>
                            <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_TONE[it.status] ?? ""}`}>
                              {STATUS_LABEL[it.status] ?? it.status}
                            </span>
                            {it.status === "duplicata" ?
                              <span className="flex shrink-0 gap-1">
                                <button
                                  type="button"
                                  onClick={() => void resolve(j.id, it.id, "nova")}
                                  className="rounded bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                                >
                                  Manter como nova
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void resolve(j.id, it.id, "existente")}
                                  className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-600"
                                >
                                  É a mesma (descartar)
                                </button>
                              </span>
                            : null}
                            {it.erroMsg ? <span className="w-full text-[11px] text-red-500">{it.erroMsg}</span> : null}
                          </li>
                        ))}
                      </ul>
                    }
                    </>
                    }
                  </div>
                : null}
              </li>
            );
          })}
        </ul>
      }
    </div>
  );
}
