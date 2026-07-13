"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  DOWNLOAD_PROVIDER_HINT,
  DOWNLOAD_PROVIDER_LABEL,
  PORTAL_DOWNLOAD_PROVIDERS,
  type DownloadProviderId,
  type PortalDownloadProviderId,
} from "@/lib/criacao/downloadParse";
import {
  isInvalidStagingMp3,
  type DownloadItemRow,
  type DownloadJobRow,
  type StagingFileRow,
} from "@/lib/criacao/downloadService";
import type { DeezerTrackCandidate } from "@/lib/criacao/deezerTrackMatch";

type JobDetail = {
  id: string;
  provider: DownloadProviderId;
  status: string;
  titulo: string;
  itens: DownloadItemRow[];
};

const TAB_ICONS: Record<PortalDownloadProviderId, string> = {
  deemix: "🟣",
};

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

function DeezerTrackPick({
  item,
  onConfirmed,
}: {
  item: DownloadItemRow;
  onConfirmed: () => void;
}) {
  const [selected, setSelected] = useState(item.pickCandidates[0]?.url ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirmPick() {
    if (!selected) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/criacao/download/items/${item.id}/pick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackUrl: selected }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; processingError?: string | null };
      if (!res.ok) {
        setErr(
          data.error === "url_invalida" ? "Link inválido."
          : data.error === "nao_precisa_escolha" ? "Esta faixa já foi confirmada."
          : "Não foi possível confirmar a escolha.",
        );
        return;
      }
      if (data.processingError) {
        setErr(`Escolha salva, mas worker: ${data.processingError}`);
      }
      onConfirmed();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/30">
      <p className="mb-2 text-[11px] font-semibold text-amber-900 dark:text-amber-200">
        Várias versões no Deezer — escolha a faixa correta (o artista no Deezer pode ser diferente do informado):
      </p>
      <ul className="max-h-36 space-y-1 overflow-auto">
        {item.pickCandidates.map((c: DeezerTrackCandidate) => (
          <li key={c.trackId}>
            <label className="flex cursor-pointer gap-2 rounded border border-amber-200/80 bg-white/80 px-2 py-1.5 dark:border-amber-900 dark:bg-slate-900/50">
              <input
                type="radio"
                name={`pick-${item.id}`}
                checked={selected === c.url}
                onChange={() => setSelected(c.url)}
                className="mt-0.5 shrink-0"
              />
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-800 dark:text-slate-100">{c.title}</span>
                <span className="block truncate text-[10px] text-slate-500">{c.artist}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={busy || !selected}
        onClick={() => void confirmPick()}
        className="mt-2 rounded bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-500 disabled:opacity-40"
      >
        {busy ? "Confirmando…" : "Baixar esta faixa"}
      </button>
      {err ? <p className="mt-1 text-[10px] text-red-700 dark:text-red-300">{err}</p> : null}
    </div>
  );
}

export function DownloadLinkPanel() {
  const [tab, setTab] = useState<PortalDownloadProviderId>("deemix");
  const [titulo, setTitulo] = useState("");
  const [linhas, setLinhas] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [jobs, setJobs] = useState<DownloadJobRow[]>([]);
  const [staging, setStaging] = useState<StagingFileRow[]>([]);
  const [config, setConfig] = useState<Record<PortalDownloadProviderId, boolean>>(() =>
    Object.fromEntries(PORTAL_DOWNLOAD_PROVIDERS.map((p) => [p, false])) as Record<
      PortalDownloadProviderId,
      boolean
    >,
  );
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<{
    cloud2Configured?: boolean;
    cloud2Health?: Record<string, unknown> | null;
    cloud2Error?: string | null;
  } | null>(null);

  async function fetchJobDetail(id: string): Promise<JobDetail | null> {
    const res = await fetch(`/api/criacao/download/${id}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { job?: JobDetail };
    return data.job ?? null;
  }

  const load = useCallback(async () => {
    try {
      const [jobsRes, stagingRes, diagRes] = await Promise.all([
        fetch(`/api/criacao/download?provider=${tab}`),
        fetch("/api/criacao/download?view=staging"),
        fetch("/api/criacao/download/diagnostics"),
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
      if (diagRes.ok) {
        setDiagnostics((await diagRes.json()) as typeof diagnostics);
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
    const combined = linhas.trim();
    if (!combined) {
      setMsg("Cole links Deezer ou nomes das faixas (Artista - Música).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/criacao/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: tab, titulo: titulo.trim() || undefined, linhas: combined }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        totalItens?: number;
        itensErro?: number;
        itensPick?: number;
        processingTriggered?: boolean;
        processingError?: string | null;
      };
      if (!res.ok) {
        setMsg(
          data.error === "nenhuma_linha" ? "Nenhuma linha válida no texto."
          : data.error === "invalid_provider" ? "Motor inválido."
          : data.error === "expand_falhou" && data.message ? data.message
          : data.message ? data.message
          : data.error ? `Erro: ${data.error}`
          : "Não foi possível criar o lote.",
        );
        return;
      }
      setLinhas("");
      setTitulo("");
      const parts = [`${data.totalItens ?? 0} faixa(s) no lote.`];
      if ((data.itensPick ?? 0) > 0) {
        parts.push(`${data.itensPick} aguardando escolha no Deezer — abra o lote.`);
      }
      if ((data.itensErro ?? 0) > 0) {
        parts.push(`${data.itensErro} com erro — veja o detalhe do lote.`);
      }
      parts.push(
        data.processingTriggered ?
          "Download iniciado no servidor."
        : data.processingError ?
          `Worker cloud2: ${data.processingError}`
        : "Worker cloud2 ainda não configurado — falta CRIACAO_CLOUD2_DOWNLOAD_PROCESS_URL no Netlify.",
      );
      setMsg(parts.join(" "));
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
    const detail = await fetchJobDetail(id);
    setJobDetail(detail);
  }

  async function refreshOpenJob() {
    if (!openJobId) return;
    const detail = await fetchJobDetail(openJobId);
    setJobDetail(detail);
    await load();
  }

  function erroResumoJob(j: DownloadJobRow): string {
    return j.erroResumo?.trim() || j.erroMsg?.trim() || "";
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

      {PORTAL_DOWNLOAD_PROVIDERS.length > 1 ?
        <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          {PORTAL_DOWNLOAD_PROVIDERS.map((id) => (
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
              {TAB_ICONS[id]} {DOWNLOAD_PROVIDER_LABEL[id]}
            </button>
          ))}
        </div>
      : null}

      {!config[tab] ?
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Motor ainda não configurado no Netlify — você pode criar lotes, mas o download só roda quando{" "}
          <code className="text-xs">CRIACAO_DEEMIX_URL</code> estiver definido.
        </div>
      : null}

      {diagnostics?.cloud2Error ?
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <strong>Worker cloud2:</strong> {diagnostics.cloud2Error}
        </div>
      : diagnostics?.cloud2Health ?
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          Cloud2 online
          {typeof diagnostics.cloud2Health.deemix === "boolean" ?
            ` · Deemix ${diagnostics.cloud2Health.deemix ? "ok" : "off"}`
          : null}
        </div>
      : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-1 text-sm font-bold text-slate-800 dark:text-slate-100">
            Novo lote — {DOWNLOAD_PROVIDER_LABEL[tab]}
          </h2>
          <p className="mb-3 text-xs text-slate-500">{DOWNLOAD_PROVIDER_HINT[tab]}</p>
          {tab === "deemix" ?
            <>
              <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                No Deemix direto, <strong>link.deezer.com não funciona</strong> — só{" "}
                <code className="text-[11px]">www.deezer.com/track|playlist|album/…</code>. Aqui você
                pode colar o link curto ou a playlist Deezer: o portal resolve e envia faixa a faixa para o
                servidor.
              </p>
              <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
                Playlist no Spotify? Converta fora do portal com{" "}
                <a
                  href="https://soundiiz.com/tutorial/spotify-to-deezer"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold underline"
                >
                  Soundiiz
                </a>{" "}
                ou{" "}
                <a
                  href="https://www.tunemymusic.com/transfer?source=spotify&target=deezer"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold underline"
                >
                  TuneMyMusic
                </a>
                , depois cole o link{" "}
                <code className="text-[11px]">deezer.com/playlist/…</code> aqui — ou exporte TXT
                «Artista - Música».
              </p>
            </>
          : null}

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
                "https://www.deezer.com/playlist/…\nArtista - Nome da música\nhttps://www.deezer.com/track/…"
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
                      {f.sizeBytes != null && isInvalidStagingMp3(f.sizeBytes) ?
                        <span className="font-semibold text-red-600 dark:text-red-400"> · arquivo inválido (refaça o download)</span>
                      : null}
                    </div>
                  </li>
                ))}
              </ul>
            }
            <Link
              href="/criacao/upload?fromDownload=1#import-download"
              className="mt-3 inline-block rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-300"
            >
              Importar no Upload →
            </Link>
            <p className="mt-2 text-[11px] text-slate-500">
              No Upload, use «Importar do Download link» — as faixas entram no lote sem arrastar MP3 do PC.
            </p>
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
                      {j.status === "erro" || j.itensErro > 0 ?
                        erroResumoJob(j) ?
                          <p className="mt-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] leading-snug text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                            {erroResumoJob(j)}
                          </p>
                        : <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                            Clique para ver o detalhe de cada faixa.
                          </p>
                      : null}
                    </button>
                    {openJobId === j.id && jobDetail ?
                      <ul className="mt-2 max-h-64 space-y-2 overflow-auto rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-950">
                        {jobDetail.itens.map((it) => (
                          <li key={it.id} className="flex flex-col gap-1 border-b border-slate-200/80 pb-2 last:border-0 dark:border-slate-800">
                            <div className="flex flex-wrap gap-2">
                              <span className="min-w-0 flex-1 truncate">{it.linhaOriginal}</span>
                              <span
                                className={
                                  "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase " +
                                  (it.needsPick ?
                                    "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                                  : STATUS_TONE[it.status] ?? "")
                                }
                              >
                                {it.needsPick ? "Escolher" : STATUS_LABEL[it.status] ?? it.status}
                              </span>
                            </div>
                            {it.needsPick && it.pickCandidates.length > 0 ?
                              <DeezerTrackPick item={it} onConfirmed={() => void refreshOpenJob()} />
                            : it.erroMsg ?
                              <p className="text-[11px] leading-snug text-red-700 dark:text-red-300">{it.erroMsg}</p>
                            : it.status === "aguardando" ?
                              <p className="text-[10px] text-slate-500">Na fila — aguardando worker cloud2.</p>
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
