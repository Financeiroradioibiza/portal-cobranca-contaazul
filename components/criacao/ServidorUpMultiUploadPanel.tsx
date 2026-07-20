"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTagChipPreview } from "@/components/criacao/CriativoTagSelect";
import {
  buildUploadSessionFromDraft,
  clearServidorUpUploadSession,
  fetchServidorUpUploadSession,
  isUploadSessionStaleForJob,
  persistServidorUpUploadSession,
  readActiveDeemixJobId,
  readServidorUpUploadSession,
  readServidorUpWorkflowDraft,
  writeServidorUpUploadSession,
  type ServidorUpUploadSession,
} from "@/lib/criacao/servidorUpUploadSession";
import type { ServidorUpUploadPlan } from "@/lib/criacao/servidorUpUploadService";

type BuildResponse = {
  ok?: boolean;
  plan?: ServidorUpUploadPlan;
  stats?: {
    lotes: number;
    tracksMatched: number;
    unmatched: number;
    orphanDownloads: number;
    hierarchyErrors: number;
  };
  error?: string;
};

type EnqueueResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  messages?: string[];
  jobIds?: string[];
  stagingImported?: number;
  stagingErrors?: string[];
  stats?: { lotes: number; tracks: number; unmatched: number };
  unmatched?: string[];
};

type SnapshotSummary = {
  downloadJobId: string;
  titulo: string;
  trackCount: number;
  savedAt: number;
};

type DeemixJobSummary = {
  id: string;
  titulo: string;
  status: string;
  totalItens: number;
  itensOk: number;
  createdAt: string;
};

type SessionsResponse = {
  ok?: boolean;
  snapshots?: SnapshotSummary[];
  servidorUpJobs?: DeemixJobSummary[];
  error?: string;
};

export function ServidorUpMultiUploadPanel() {
  const router = useRouter();
  const [session, setSession] = useState<ServidorUpUploadSession | null>(null);
  const [plan, setPlan] = useState<ServidorUpUploadPlan | null>(null);
  const [stats, setStats] = useState<BuildResponse["stats"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [deemixJobs, setDeemixJobs] = useState<DeemixJobSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectingJob, setSelectingJob] = useState(false);

  const loadPlan = useCallback(async (s: ServidorUpUploadSession) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/criacao/servidor-up/build-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          downloadJobId: s.downloadJobId,
          hierarchyRows: s.hierarchyRows,
          drafts: s.drafts,
          tracks: s.tracks,
        }),
      });
      const data = (await res.json()) as BuildResponse;
      if (!res.ok || !data.plan) {
        throw new Error(data.error ?? "Falha ao montar lotes.");
      }
      setPlan(data.plan);
      setStats(data.stats ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao carregar plano.");
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const activateSession = useCallback(
    async (s: ServidorUpUploadSession) => {
      writeServidorUpUploadSession(s);
      setSession(s);
      await loadPlan(s);
    },
    [loadPlan],
  );

  const loadAvailableSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch("/api/criacao/servidor-up/upload-sessions");
      const data = (await res.json()) as SessionsResponse;
      if (res.ok) {
        setSnapshots(data.snapshots ?? []);
        setDeemixJobs(data.servidorUpJobs ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const pickJob = useCallback(
    async (jobId: string) => {
      setSelectingJob(true);
      setErr(null);
      try {
        const s = await fetchServidorUpUploadSession(jobId);
        if (!s) {
          throw new Error(
            "Este job Deemix não tem hierarquia salva. Volte ao Servidor UP (passos 0–4) na mesma sessão ou refaça o fluxo para gerar o snapshot.",
          );
        }
        await activateSession(s);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Falha ao carregar sessão.");
      } finally {
        setSelectingJob(false);
      }
    },
    [activateSession],
  );

  const dismissSnapshot = useCallback(
    async (downloadJobId: string) => {
      if (
        !window.confirm(
          "Remover este snapshot salvo no servidor? O download Deemix continua no Download link — só some da lista de hierarquias.",
        )
      ) {
        return;
      }
      setErr(null);
      try {
        const res = await fetch(
          `/api/criacao/servidor-up/upload-session/${encodeURIComponent(downloadJobId)}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error("Não foi possível remover o snapshot.");
        const local = readServidorUpUploadSession();
        if (local?.downloadJobId === downloadJobId) clearServidorUpUploadSession();
        if (session?.downloadJobId === downloadJobId) {
          setSession(null);
          setPlan(null);
        }
        await loadAvailableSessions();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Falha ao remover snapshot.");
      }
    },
    [loadAvailableSessions, session?.downloadJobId],
  );

  const linkDraftToDeemixJob = useCallback(
    async (jobId: string) => {
      setSelectingJob(true);
      setErr(null);
      try {
        const draft = readServidorUpWorkflowDraft();
        if (!draft || draft.tracks.length === 0) {
          throw new Error(
            "Não há rascunho de hierarquia neste navegador. Abra Servidor UP, refaça passos 0–3 (ou só confirme se ainda estiver lá) e volte.",
          );
        }
        const uploadSession = buildUploadSessionFromDraft(jobId, draft);
        await persistServidorUpUploadSession(uploadSession);
        await activateSession(uploadSession);
        setMsg(
          `Job ${jobId.slice(0, 8)}… vinculado com ${uploadSession.tracks.length} faixa(s) do rascunho.`,
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Falha ao vincular job.");
      } finally {
        setSelectingJob(false);
      }
    },
    [activateSession],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/criacao/servidor-up/upload-sessions");
        const data = (await res.json()) as SessionsResponse;
        const jobs = res.ok ? (data.servidorUpJobs ?? []) : [];
        const snaps = res.ok ? (data.snapshots ?? []) : [];
        setSnapshots(snaps);
        setDeemixJobs(jobs);

        const local = readServidorUpUploadSession();
        const activeJobId = readActiveDeemixJobId();

        if (local && activeJobId && local.downloadJobId !== activeJobId) {
          clearServidorUpUploadSession();
        } else if (local) {
          const job = jobs.find((j) => j.id === local.downloadJobId);
          if (!isUploadSessionStaleForJob(local, job)) {
            await activateSession(local);
            return;
          }
          clearServidorUpUploadSession();
        }

        if (activeJobId) {
          const fromServer = await fetchServidorUpUploadSession(activeJobId);
          if (fromServer) {
            await activateSession(fromServer);
            return;
          }
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [activateSession]);

  async function submitMultiUpload() {
    if (!session || !plan) return;
    setSubmitting(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/criacao/servidor-up/enqueue-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          downloadJobId: session.downloadJobId,
          titulo: session.titulo,
          hierarchyRows: session.hierarchyRows,
          drafts: session.drafts,
          tracks: session.tracks,
        }),
      });
      const data = (await res.json()) as EnqueueResponse;
      if (!res.ok || !data.ok) {
        if (data.error === "hierarquia_incompleta") {
          throw new Error(data.messages?.join(" · ") ?? "Hierarquia incompleta no passo 0.");
        }
        if (data.error === "nenhuma_faixa_mapeada") {
          throw new Error(
            `Nenhuma faixa mapeada. ${(data.unmatched ?? []).slice(0, 3).join(" · ")}`,
          );
        }
        throw new Error(data.message ?? data.error ?? "Falha no multi-upload.");
      }
      clearServidorUpUploadSession();
      const parts = [
        `${data.stats?.tracks ?? data.stagingImported ?? 0} faixa(s) importadas`,
        `${data.stats?.lotes ?? data.jobIds?.length ?? 0} pasta(s)`,
      ];
      if ((data.stats?.unmatched ?? 0) > 0) parts.push(`${data.stats!.unmatched} não mapeada(s)`);
      if (data.stagingErrors?.length) parts.push(`avisos: ${data.stagingErrors.slice(0, 2).join(" · ")}`);
      setMsg(parts.join(" · "));
      router.push("/criacao/fila");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!session) {
    const snapshotIds = new Set(snapshots.map((s) => s.downloadJobId));
    const jobsWithoutSnapshot = deemixJobs.filter(
      (j) => !snapshotIds.has(j.id) && j.itensOk > 0,
    );
    const workflowDraft = readServidorUpWorkflowDraft();
    const activeJobId = readActiveDeemixJobId();
    const preferredJob =
      (activeJobId ? jobsWithoutSnapshot.find((j) => j.id === activeJobId) : null) ??
      jobsWithoutSnapshot[0];

    return (
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/90 p-4 dark:border-amber-900 dark:bg-amber-950/30">
        <h2 className="text-sm font-bold text-amber-950 dark:text-amber-100">Multi-Upload (Servidor UP)</h2>
        <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-200/90">
          Escolha um job Deemix do Servidor UP com hierarquia salva, ou conclua o download no{" "}
          <Link href="/criacao/servidor-up" className="font-semibold underline">
            Servidor UP
          </Link>{" "}
          (Passo 5).
        </p>

        {err ?
          <p className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300">{err}</p>
        : null}
        {msg ?
          <p className="mt-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">{msg}</p>
        : null}

        {preferredJob && workflowDraft ?
          <div className="mt-3 rounded-lg border-2 border-emerald-400 bg-emerald-50/90 p-3 dark:border-emerald-700 dark:bg-emerald-950/40">
            <p className="text-xs font-bold text-emerald-950 dark:text-emerald-100">
              Seu download recente ({preferredJob.itensOk}/{preferredJob.totalItens} MP3)
            </p>
            <p className="mt-1 text-[11px] text-emerald-900/90 dark:text-emerald-200/90">
              Há hierarquia salva neste navegador ({workflowDraft.tracks.length} faixa(s) mapeadas).
              Vincule ao job Deemix — não use o snapshot antigo de teste.
            </p>
            <button
              type="button"
              disabled={selectingJob}
              onClick={() => void linkDraftToDeemixJob(preferredJob.id)}
              className="mt-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Vincular e abrir Multi-Upload →
            </button>
          </div>
        : null}

        {loading || loadingSessions ?
          <p className="mt-3 text-xs text-amber-800/80">Carregando jobs…</p>
        : snapshots.length > 0 ?
          <div className="mt-3">
            <p className="mb-2 text-[11px] font-semibold text-amber-950 dark:text-amber-100">
              Jobs com hierarquia salva
            </p>
            <ul className="space-y-2">
              {snapshots.map((snap) => (
                <li
                  key={snap.downloadJobId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200/80 bg-white/90 px-3 py-2 dark:border-amber-800 dark:bg-slate-900/70"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {snap.titulo}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {snap.trackCount} faixa(s) · job {snap.downloadJobId.slice(0, 8)}… ·{" "}
                      {new Date(snap.savedAt).toLocaleString("pt-BR")}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={selectingJob}
                    onClick={() => void pickJob(snap.downloadJobId)}
                    className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Usar este job
                  </button>
                  <button
                    type="button"
                    disabled={selectingJob}
                    onClick={() => void dismissSnapshot(snap.downloadJobId)}
                    className="rounded-lg border border-red-300 px-2 py-1.5 text-[10px] font-semibold text-red-800 dark:border-red-800 dark:text-red-200"
                  >
                    Remover snapshot
                  </button>
                </li>
              ))}
            </ul>
          </div>
        : null}

        {jobsWithoutSnapshot.length > 0 ?
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-semibold text-amber-950 dark:text-amber-100">
              Downloads concluídos sem hierarquia salva
            </p>
            <ul className="space-y-2">
              {jobsWithoutSnapshot.map((job) => (
                <li
                  key={job.id}
                  className="rounded-lg border border-dashed border-amber-300/80 bg-white/60 px-3 py-2 dark:border-amber-700 dark:bg-slate-900/50"
                >
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{job.titulo}</div>
                  <div className="text-[11px] text-slate-500">
                    {job.itensOk}/{job.totalItens} baixada(s) · job {job.id.slice(0, 8)}…
                  </div>
                  {workflowDraft ?
                    <button
                      type="button"
                      disabled={selectingJob}
                      onClick={() => void linkDraftToDeemixJob(job.id)}
                      className="mt-2 rounded-lg bg-violet-900 px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                    >
                      Vincular hierarquia desta sessão ({workflowDraft.tracks.length} faixas)
                    </button>
                  : (
                    <p className="mt-1 text-[10px] text-amber-800 dark:text-amber-300">
                      Abra o Servidor UP (passos 0–3) na mesma aba e volte aqui, ou use Passo 5 →
                      Salvar snapshot.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        : null}

        {!loading && !loadingSessions && snapshots.length === 0 && jobsWithoutSnapshot.length === 0 ?
          <p className="mt-3 text-xs text-amber-800/80">
            Nenhum job Servidor UP encontrado. Use o{" "}
            <Link href="/criacao/upload" className="font-semibold underline">
              upload comum
            </Link>{" "}
            para lotes já importados manualmente.
          </p>
        : null}

        <button
          type="button"
          onClick={() => void loadAvailableSessions()}
          className="mt-3 rounded border border-amber-300 px-2 py-1 text-[10px] font-semibold dark:border-amber-700"
        >
          Atualizar lista
        </button>
      </div>
    );
  }

  const totalMatched = plan?.lotes.reduce((n, l) => n + l.tracks.length, 0) ?? 0;

  return (
    <div className="mb-6 rounded-xl border-2 border-violet-400 bg-violet-50/90 p-4 dark:border-violet-600 dark:bg-violet-950/40">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-violet-950 dark:text-violet-100">
            Multi-Upload (Servidor UP)
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-violet-900/90 dark:text-violet-200/90">
            Pastas e tags já definidas no passo 0 do Servidor UP — cada faixa vai para a programação/pasta
            correta. Job Deemix <code className="text-[10px]">{session.downloadJobId.slice(0, 8)}…</code>
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            clearServidorUpUploadSession();
            setSession(null);
            setPlan(null);
            setStats(null);
            void loadAvailableSessions();
          }}
          className="rounded border border-violet-300 px-2 py-1 text-[10px] font-semibold dark:border-violet-700"
        >
          Sair / escolher outro job
        </button>
      </div>

      {loading ?
        <p className="text-xs text-violet-800/80">Montando lotes por pasta…</p>
      : err ?
        <p className="text-xs font-semibold text-red-700 dark:text-red-300">{err}</p>
      : plan ?
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-violet-900 dark:text-violet-200">
            <span className="rounded bg-white/80 px-2 py-0.5 dark:bg-slate-900/60">
              {stats?.lotes ?? plan.lotes.length} pasta(s)
            </span>
            <span className="rounded bg-white/80 px-2 py-0.5 dark:bg-slate-900/60">
              {totalMatched} faixa(s) mapeada(s)
            </span>
            {(stats?.unmatched ?? 0) > 0 ?
              <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {stats!.unmatched} sem match Deemix
              </span>
            : null}
          </div>

          <ul className="mb-3 max-h-64 space-y-2 overflow-y-auto">
            {plan.lotes.map((lote) => (
              <li
                key={lote.hierarchyKey}
                className="rounded-lg border border-violet-200/80 bg-white/90 px-3 py-2 dark:border-violet-800 dark:bg-slate-900/70"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {lote.clienteNome} · {lote.programacaoNome} / {lote.pastaNome}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {lote.tracks.length} faixa(s) · tag{" "}
                      <span className="font-semibold">{formatTagChipPreview("", lote.uploadTagNome)}</span>
                    </div>
                  </div>
                </div>
                <ul className="mt-1 space-y-0.5 text-[10px] text-slate-500">
                  {lote.tracks.slice(0, 4).map((t) => (
                    <li key={t.downloadItemId} className="truncate">
                      {t.artista ? `${t.artista} — ` : ""}
                      {t.titulo || t.arquivoNome}
                    </li>
                  ))}
                  {lote.tracks.length > 4 ?
                    <li>… +{lote.tracks.length - 4} faixa(s)</li>
                  : null}
                </ul>
              </li>
            ))}
          </ul>

          {plan.unmatchedTracks.length > 0 ?
            <details className="mb-3 text-[11px] text-amber-900 dark:text-amber-200">
              <summary className="cursor-pointer font-semibold">
                {plan.unmatchedTracks.length} faixa(s) não mapeada(s)
              </summary>
              <ul className="mt-1 list-inside list-disc">
                {plan.unmatchedTracks.slice(0, 15).map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </details>
          : null}

          {msg ?
            <p className="mb-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">{msg}</p>
          : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={submitting || totalMatched === 0}
              onClick={() => void submitMultiUpload()}
              className="rounded-lg bg-violet-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ?
                "Enviando para fila…"
              : `Subir ${totalMatched} faixa(s) para ${plan.lotes.length} pasta(s)`}
            </button>
            <Link
              href="/criacao/servidor-up"
              className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold dark:border-violet-700"
            >
              Voltar ao Servidor UP
            </Link>
          </div>
        </>
      : null}
    </div>
  );
}
