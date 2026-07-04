"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  DOWNLOAD_PROVIDER_HINT,
  DOWNLOAD_PROVIDER_LABEL,
  type DownloadProviderId,
  type PortalDownloadProviderId,
} from "@/lib/criacao/downloadParse";
import type { DownloadItemRow, DownloadJobRow, StagingFileRow } from "@/lib/criacao/downloadService";

type JobDetail = {
  id: string;
  provider: DownloadProviderId;
  status: string;
  titulo: string;
  itens: DownloadItemRow[];
};

const TABS: { id: PortalDownloadProviderId; icon: string }[] = [
  { id: "deemix", icon: "🟣" },
  { id: "youtube", icon: "▶️" },
];

const STATUS_LABEL: Record<string, string> = {
  aguardando: "Aguardando",
  processando: "Baixando",
  concluido: "Concluído",
  erro: "Erro",
  cancelado: "Cancelado",
};

const STATUS_TONE: Record<string, string> = {
  aguardando: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  processando: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  concluido: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  erro: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  cancelado: "bg-slate-100 text-slate-500 line-through dark:bg-slate-800",
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

function formatBytes(b: number | null): string {
  if (!b) return "—";
  const mb = b / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

export function DownloadLinkPanel() {
  const [tab, setTab] = useState<PortalDownloadProviderId>("deemix");
  const [titulo, setTitulo] = useState("");
  const [linhas, setLinhas] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [jobs, setJobs] = useState<DownloadJobRow[]>([]);
  const [staging, setStaging] = useState<StagingFileRow[]>([]);
  const [config, setConfig] = useState<Record<PortalDownloadProviderId, boolean>>({
    deemix: false,
    youtube: false,
  });
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchJobDetail(id: string): Promise<JobDetail | null> {
    const res = await fetch(`/api/criacao/download/${id}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { job?: JobDetail };
    return data.job ?? null;
  }

  const load = useCallback(async () => {
    try {
      const [jobsRes, stagingRes] = await Promise.all([
        fetch(`/api/criacao/download?provider=${tab}`),
        fetch("/api/criacao/download?view=staging"),
      ]);
      if (jobsRes.ok) {
        const data = (await jobsRes.json()) as {
          jobs?: DownloadJobRow[];
          config?: Record<PortalDownloadProviderId, boolean>;
        };
        setJobs(data.jobs ?? []);
        if (data.config) setConfig(data.config);
      }
      if (stagingRes.ok) {
        const data = (await stagingRes.json()) as { staging?: StagingFileRow[] };
        setStaging(data.staging ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => {
      void load();
      if (openJobId) {
        void fetchJobDetail(openJobId).then(setJobDetail);
      }
      void fetch("/api/criacao/download/sync-pending", { method: "POST" }).catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, [load, openJobId]);

  async function submit() {
    setMsg(null);
    if (!linhas.trim()) {
      setMsg("Cole pelo menos uma linha (link ou nome da faixa).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/criacao/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: tab, titulo: titulo.trim() || undefined, linhas }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        totalItens?: number;
        processingTriggered?: boolean;
        processingError?: string | null;
      };
      if (!res.ok) {
        setMsg(
          data.error === "nenhuma_linha" ? "Nenhuma linha válida no texto."
          : data.error === "invalid_provider" ? "Motor inválido."
          : "Não foi possível criar o lote.",
        );
        return;
      }
      setLinhas("");
      setTitulo("");
      setMsg(
        `${data.totalItens ?? 0} faixa(s) na fila.` +
          (data.processingTriggered ?
            " Download iniciado no servidor."
          : data.processingError ?
            ` Worker cloud2: ${data.processingError}`
          : " Worker cloud2 ainda não configurado — falta CRIACAO_CLOUD2_DOWNLOAD_PROCESS_URL no Netlify."),
      );
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function openJob(id: string) {
    if (openJobId === id) {
      setOpenJobId(null);
      setJobDetail(null);
      return;
    }
    setOpenJobId(id);
    setJobDetail(await fetchJobDetail(id));
  }

  const stagingFiltered = staging.filter((s) => s.provider === tab);

  return (
    <div className="mx-auto max-w-[1100px] px-3 py-6 sm:px-4">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Download link</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cole links ou nomes das faixas — o download roda no servidor (cloud2). Depois use{" "}
          <Link href="/criacao/upload" className="font-semibold text-sky-600 hover:underline dark:text-sky-400">
            Upload
          </Link>{" "}
          para enviar os arquivos prontos à fila de processamento.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        {TABS.map(({ id, icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              "rounded-lg px-3 py-2 text-xs font-semibold transition " +
              (tab === id ?
                "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800")
            }
          >
            {icon} {DOWNLOAD_PROVIDER_LABEL[id]}
          </button>
        ))}
      </div>

      {!config[tab] ?
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Motor ainda não configurado no servidor — você pode criar lotes; o download começa quando o cloud2 tiver as variáveis de ambiente deste motor.
        </div>
      : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-1 text-sm font-bold text-slate-800 dark:text-slate-100">
            Novo lote — {DOWNLOAD_PROVIDER_LABEL[tab]}
          </h2>
          <p className="mb-3 text-xs text-slate-500">{DOWNLOAD_PROVIDER_HINT[tab]}</p>

          <label className="mb-2 block text-xs font-semibold text-slate-500">
            Título do lote (opcional)
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Playlist cliente X"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </label>

          <label className="mb-3 block text-xs font-semibold text-slate-500">
            Uma linha por faixa
            <textarea
              value={linhas}
              onChange={(e) => setLinhas(e.target.value)}
              rows={10}
              placeholder={
                tab === "deemix" ?
                  "https://www.deezer.com/track/…\nArtista - Nome da música"
                : "https://www.youtube.com/watch?v=…\nArtista - Nome da música"
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
            />
          </label>

          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            {submitting ? "Enviando…" : "Baixar no servidor"}
          </button>
          {msg ? <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{msg}</p> : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">Prontos no servidor</h2>
            {stagingFiltered.length === 0 ?
              <p className="text-xs text-slate-500">Nenhum arquivo pronto deste motor ainda.</p>
            : <ul className="max-h-48 space-y-1 overflow-auto text-sm">
                {stagingFiltered.slice(0, 30).map((f) => (
                  <li key={f.id} className="rounded border border-slate-100 px-2 py-1 dark:border-slate-800">
                    <div className="truncate font-medium">{f.titulo || f.arquivoNome}</div>
                    <div className="truncate text-xs text-slate-500">
                      {f.artista ? `${f.artista} · ` : ""}
                      {formatBytes(f.sizeBytes)}
                    </div>
                  </li>
                ))}
              </ul>
            }
            <Link
              href="/criacao/upload"
              className="mt-3 inline-block rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-300"
            >
              Ir para Upload →
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">Lotes recentes</h2>
            {loading ?
              <p className="text-xs text-slate-500">Carregando…</p>
            : jobs.length === 0 ?
              <p className="text-xs text-slate-500">Nenhum lote ainda.</p>
            : <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {jobs.map((j) => (
                  <li key={j.id} className="py-2">
                    <button
                      type="button"
                      onClick={() => void openJob(j.id)}
                      className="w-full text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{j.titulo}</span>
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_TONE[j.status] ?? ""}`}>
                          {STATUS_LABEL[j.status] ?? j.status}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {j.itensOk}/{j.totalItens} ok
                        {j.itensErro > 0 ? ` · ${j.itensErro} erro(s)` : ""}
                        {" · "}
                        {formatWhen(j.createdAt)}
                      </div>
                    </button>
                    {openJobId === j.id && jobDetail ?
                      <ul className="mt-2 max-h-40 space-y-1 overflow-auto rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-950">
                        {jobDetail.itens.map((it) => (
                          <li key={it.id} className="flex flex-wrap gap-2">
                            <span className="min-w-0 flex-1 truncate">{it.linhaOriginal}</span>
                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${STATUS_TONE[it.status] ?? ""}`}>
                              {STATUS_LABEL[it.status] ?? it.status}
                            </span>
                            {it.erroMsg ?
                              <span className="w-full text-red-600">{it.erroMsg}</span>
                            : null}
                          </li>
                        ))}
                      </ul>
                    : null}
                  </li>
                ))}
              </ul>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
