import { resolveTagCriativoUser } from "@/lib/criacao/criativoUserService";
import { markCriativoEntregueAuto, markSubidaFilaPainel } from "@/lib/criacao/atualizacaoPainelService";
import { abrirAtualizacao } from "@/lib/criacao/atualizacaoService";
import { createUploadJobsBatch, type UploadLoteInput } from "@/lib/criacao/filaService";
import { ingestFromStagingOnCloud2 } from "@/lib/criacao/ingestFromStaging";
import { applyPendingUploadTags } from "@/lib/criacao/uploadTagService";
import { appendLegacyMixSuffixToMp3Nome } from "@/lib/criacao/legacyMixFilename";
import {
  buildServidorUpUploadPlan,
  servidorUpPlanToUploadLotes,
  type ServidorUpUploadDraftInput,
  type ServidorUpUploadTrackInput,
} from "@/lib/criacao/servidorUpUploadService";
import type { ServidorUpHierarchyRow } from "@/lib/criacao/servidorUpHierarchyService";
import {
  getServidorUpUploadSnapshot,
  saveServidorUpUploadSnapshot,
  listServidorUpUploadSnapshots,
} from "@/lib/criacao/servidorUpUploadSnapshotService";
import type { ServidorUpUploadSession } from "@/lib/criacao/servidorUpUploadSession";
import { triggerDownloadProcessing } from "@/lib/criacao/downloadService";
import { prisma } from "@/lib/prisma";

/** Quantas pastas (lotes) por request — evita timeout Netlify em 500+ faixas. */
export const SERVIDOR_UP_ENQUEUE_LOTE_CHUNK = 4;

export type ServidorUpFilaEnqueueState = {
  jobIds: string[];
  lotesDone: number;
  lotesTotal: number;
  tracksImported: number;
  startedAt?: number;
  finishedAt?: number;
  lastError?: string | null;
};

export type ServidorUpUploadSessionMeta = ServidorUpUploadSession & {
  /** Default true — envia para fila quando download terminar (sem Passo 5 manual). */
  autoEnqueueFila?: boolean;
  enqueuedByEmail?: string;
  enqueuedByDisplayName?: string;
  filaEnqueue?: ServidorUpFilaEnqueueState;
};

export type ServidorUpEnqueueChunkInput = {
  downloadJobId: string;
  titulo: string;
  hierarchyRows: ServidorUpHierarchyRow[];
  drafts?: Record<string, ServidorUpUploadDraftInput>;
  tracks: ServidorUpUploadTrackInput[];
  uploaderEmail: string;
  uploaderDisplayName: string;
  /** Índice do primeiro lote neste chunk (0-based). */
  loteOffset?: number;
  loteLimit?: number;
};

export type ServidorUpEnqueueChunkResult = {
  ok: boolean;
  error?: string;
  messages?: string[];
  jobIds: string[];
  stagingImported: number;
  stagingErrors: string[];
  lotesTotal: number;
  lotesProcessed: number;
  lotesRemaining: number;
  tracksImported: number;
  unmatched: string[];
  done: boolean;
};

async function normalizeUploadArquivos(
  arquivos: Array<{
    nome?: string;
    sizeBytes?: number;
    downloadItemId?: string;
    mixSegundosFromLegacy?: number;
  }>,
) {
  const out: Array<{ nome: string; sizeBytes?: number; downloadItemId?: string }> = [];
  for (const a of arquivos) {
    if (!a.downloadItemId && !a.nome?.trim()) continue;
    if (a.downloadItemId) {
      const dl = await prisma.downloadItem.findFirst({
        where: {
          id: a.downloadItemId,
          status: "concluido",
          storageKey: { not: null },
          NOT: { providerRef: { startsWith: "import:" } },
        },
        select: { id: true, arquivoNome: true, titulo: true, artista: true, sizeBytes: true },
      });
      if (!dl) throw new Error("staging_item_invalido");
      const artista = dl.artista.trim();
      const titulo = dl.titulo.trim();
      let nome =
        artista && titulo ? `${artista} - ${titulo}.mp3`.slice(0, 500)
        : dl.arquivoNome.trim() ?
          dl.arquivoNome.slice(0, 500)
        : `${titulo || "faixa"}.mp3`.slice(0, 500);
      if (a.mixSegundosFromLegacy != null) {
        nome = appendLegacyMixSuffixToMp3Nome(nome, a.mixSegundosFromLegacy);
      }
      out.push({ nome, sizeBytes: dl.sizeBytes ?? a.sizeBytes, downloadItemId: dl.id });
      continue;
    }
    out.push({ nome: a.nome!.trim().slice(0, 500), sizeBytes: a.sizeBytes });
  }
  return out;
}

function buildStagingPairs(
  jobs: Array<{ id: string; itens: { id: string; arquivoNome: string }[] }>,
  lotes: UploadLoteInput[],
) {
  const pairs: { processamentoItemId: string; downloadItemId: string }[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!;
    const arquivos = lotes[i]?.arquivos ?? [];
    for (let j = 0; j < job.itens.length; j++) {
      const dlId = arquivos[j]?.downloadItemId;
      if (dlId) pairs.push({ processamentoItemId: job.itens[j]!.id, downloadItemId: dlId });
    }
  }
  return pairs;
}

export async function countDownloadJobPending(downloadJobId: string): Promise<{
  pending: number;
  processing: number;
  ok: number;
  total: number;
  jobStatus: string;
}> {
  const job = await prisma.downloadJob.findUnique({
    where: { id: downloadJobId },
    select: { status: true, totalItens: true },
  });
  const counts = await prisma.downloadItem.groupBy({
    by: ["status"],
    where: { jobId: downloadJobId },
    _count: { _all: true },
  });
  const map = new Map(counts.map((c) => [c.status, c._count._all]));
  const pending = map.get("aguardando") ?? 0;
  const processing = map.get("processando") ?? 0;
  const ok = map.get("concluido") ?? 0;
  return {
    pending,
    processing,
    ok,
    total: job?.totalItens ?? pending + processing + ok,
    jobStatus: job?.status ?? "desconhecido",
  };
}

export function isFilaEnqueueComplete(session: ServidorUpUploadSessionMeta): boolean {
  return Boolean(session.filaEnqueue?.finishedAt);
}

export async function enqueueServidorUpFilaChunk(
  input: ServidorUpEnqueueChunkInput,
): Promise<ServidorUpEnqueueChunkResult> {
  const loteOffset = Math.max(0, input.loteOffset ?? 0);
  const loteLimit = Math.min(20, Math.max(1, input.loteLimit ?? SERVIDOR_UP_ENQUEUE_LOTE_CHUNK));

  const plan = await buildServidorUpUploadPlan({
    downloadJobId: input.downloadJobId,
    hierarchyRows: input.hierarchyRows,
    drafts: input.drafts,
    tracks: input.tracks,
  });

  if (plan.hierarchyErrors.length > 0) {
    return {
      ok: false,
      error: "hierarquia_incompleta",
      messages: plan.hierarchyErrors.slice(0, 10),
      jobIds: [],
      stagingImported: 0,
      stagingErrors: [],
      lotesTotal: 0,
      lotesProcessed: 0,
      lotesRemaining: 0,
      tracksImported: 0,
      unmatched: plan.unmatchedTracks.slice(0, 30),
      done: false,
    };
  }

  const semDono = plan.lotes.filter((l) => l.tracks.length > 0 && !l.tagCriativoUserId);
  if (semDono.length > 0) {
    const sample = semDono[0]!;
    return {
      ok: false,
      error: "programacao_sem_dono",
      messages: [
        `Defina o dono criativo na programação «${sample.programacaoNome}» (Central) ou no Passo 0. Pasta: ${sample.pastaNome}.`,
      ],
      jobIds: [],
      stagingImported: 0,
      stagingErrors: [],
      lotesTotal: plan.lotes.length,
      lotesProcessed: 0,
      lotesRemaining: plan.lotes.length,
      tracksImported: 0,
      unmatched: plan.unmatchedTracks.slice(0, 30),
      done: false,
    };
  }

  const rawLotes = servidorUpPlanToUploadLotes(plan, input.titulo);
  const lotesTotal = rawLotes.length;
  if (lotesTotal === 0) {
    return {
      ok: false,
      error: "nenhuma_faixa_mapeada",
      jobIds: [],
      stagingImported: 0,
      stagingErrors: [],
      lotesTotal: 0,
      lotesProcessed: 0,
      lotesRemaining: 0,
      tracksImported: 0,
      unmatched: plan.unmatchedTracks.slice(0, 30),
      done: false,
    };
  }

  const slice = rawLotes.slice(loteOffset, loteOffset + loteLimit);
  if (slice.length === 0) {
    return {
      ok: true,
      jobIds: [],
      stagingImported: 0,
      stagingErrors: [],
      lotesTotal,
      lotesProcessed: loteOffset,
      lotesRemaining: 0,
      tracksImported: 0,
      unmatched: plan.unmatchedTracks.slice(0, 30),
      done: true,
    };
  }

  const tagCriativoDefault = await resolveTagCriativoUser(undefined, input.uploaderEmail);
  const uploaderNome = input.uploaderDisplayName;

  const lotes: UploadLoteInput[] = [];
  for (const l of slice) {
    let arquivos = l.arquivos ?? [];
    arquivos = await normalizeUploadArquivos(arquivos);
    if (arquivos.length === 0) continue;
    const tagCriativo = await resolveTagCriativoUser(l.criativoUserId, input.uploaderEmail);
    const uploadTagNome = (l.uploadTagNome ?? "").trim();
    if (!uploadTagNome) continue;
    lotes.push({
      ...l,
      arquivos,
      uploadTagNome,
      criativoUserId: tagCriativo.email,
      criativoNome: tagCriativo.displayName,
    });
  }

  if (lotes.length === 0) {
    return {
      ok: false,
      error: "staging_item_invalido",
      jobIds: [],
      stagingImported: 0,
      stagingErrors: [],
      lotesTotal,
      lotesProcessed: loteOffset,
      lotesRemaining: Math.max(0, lotesTotal - loteOffset),
      tracksImported: 0,
      unmatched: plan.unmatchedTracks.slice(0, 30),
      done: false,
    };
  }

  const jobs = await createUploadJobsBatch(lotes, {
    criativoNome: uploaderNome,
    criativoUserId: tagCriativoDefault.email,
  });

  for (const job of jobs) {
    if (job.programacaoId) {
      await markSubidaFilaPainel(job.programacaoId, job.id, uploaderNome);
      await markCriativoEntregueAuto(job.programacaoId, uploaderNome);
    }
  }

  for (const progId of new Set(jobs.map((j) => j.programacaoId).filter(Boolean) as string[])) {
    await abrirAtualizacao(progId, uploaderNome);
  }

  const stagingPairs = buildStagingPairs(jobs, lotes);
  let stagingImported = 0;
  let stagingErrors: string[] = [];
  if (stagingPairs.length > 0) {
    const stagingResult = await ingestFromStagingOnCloud2(stagingPairs);
    stagingImported = stagingResult.imported;
    stagingErrors = stagingResult.errors;
    if (!stagingResult.ok && stagingImported === 0) {
      return {
        ok: false,
        error: "staging_import_falhou",
        messages: stagingErrors.slice(0, 5),
        jobIds: jobs.map((j) => j.id),
        stagingImported: 0,
        stagingErrors,
        lotesTotal,
        lotesProcessed: loteOffset + slice.length,
        lotesRemaining: Math.max(0, lotesTotal - loteOffset - slice.length),
        tracksImported: 0,
        unmatched: plan.unmatchedTracks.slice(0, 30),
        done: false,
      };
    }
  }

  await applyPendingUploadTags(80).catch(() => {});

  const lotesProcessed = loteOffset + slice.length;
  const lotesRemaining = Math.max(0, lotesTotal - lotesProcessed);
  const done = lotesRemaining === 0;

  return {
    ok: true,
    jobIds: jobs.map((j) => j.id),
    stagingImported,
    stagingErrors,
    lotesTotal,
    lotesProcessed,
    lotesRemaining,
    tracksImported: stagingImported,
    unmatched: plan.unmatchedTracks.slice(0, 30),
    done,
  };
}

export async function runAutoEnqueueForSnapshot(
  downloadJobId: string,
  opts?: { force?: boolean },
): Promise<ServidorUpEnqueueChunkResult | null> {
  const snapshot = (await getServidorUpUploadSnapshot(downloadJobId)) as ServidorUpUploadSessionMeta | null;
  if (!snapshot) return null;
  if (snapshot.autoEnqueueFila === false) return null;
  if (isFilaEnqueueComplete(snapshot) && !opts?.force) return null;

  const dl = await countDownloadJobPending(downloadJobId);
  const stillDownloading = dl.pending + dl.processing > 0;
  if (stillDownloading) return null;

  const planned = snapshot.tracks?.length ?? 0;
  if (dl.ok <= 0) return null;
  if (planned > 0 && dl.ok < Math.min(planned, dl.total) * 0.85) {
    return null;
  }

  const uploaderEmail = snapshot.enqueuedByEmail?.trim() || "servidor-up@portal";
  const uploaderDisplayName = snapshot.enqueuedByDisplayName?.trim() || "Servidor UP";
  const loteOffset = snapshot.filaEnqueue?.lotesDone ?? 0;

  const result = await enqueueServidorUpFilaChunk({
    downloadJobId,
    titulo: snapshot.titulo,
    hierarchyRows: snapshot.hierarchyRows,
    drafts: snapshot.drafts,
    tracks: snapshot.tracks,
    uploaderEmail,
    uploaderDisplayName,
    loteOffset,
    loteLimit: SERVIDOR_UP_ENQUEUE_LOTE_CHUNK,
  });

  const prev = snapshot.filaEnqueue;
  const nextState: ServidorUpFilaEnqueueState = {
    jobIds: [...(prev?.jobIds ?? []), ...result.jobIds],
    lotesDone: result.lotesProcessed,
    lotesTotal: result.lotesTotal,
    tracksImported: (prev?.tracksImported ?? 0) + result.tracksImported,
    startedAt: prev?.startedAt ?? Date.now(),
    finishedAt: result.done && result.ok ? Date.now() : undefined,
    lastError: result.ok ? null : result.error ?? result.messages?.[0] ?? "erro",
  };

  await saveServidorUpUploadSnapshot(downloadJobId, {
    ...snapshot,
    filaEnqueue: nextState,
    savedAt: Date.now(),
  } as ServidorUpUploadSession);

  return result;
}

export async function runServidorUpNightWorker(opts?: {
  downloadLimit?: number;
  maxSnapshots?: number;
}): Promise<{
  download: { triggered: boolean; processed?: number; error?: string };
  enqueues: Array<{ downloadJobId: string; ok: boolean; done?: boolean; tracksImported?: number; error?: string }>;
}> {
  const download = await triggerDownloadProcessing(
    Math.min(30, Math.max(1, opts?.downloadLimit ?? 12)),
    { timeoutMs: 50_000 },
  ).catch((e: unknown) => ({
    triggered: false,
    error: e instanceof Error ? e.message : "erro_download",
  }));

  const snapshots = await listServidorUpUploadSnapshots(opts?.maxSnapshots ?? 15);
  const enqueues: Array<{
    downloadJobId: string;
    ok: boolean;
    done?: boolean;
    tracksImported?: number;
    error?: string;
  }> = [];

  for (const snap of snapshots) {
    const full = (await getServidorUpUploadSnapshot(snap.downloadJobId)) as ServidorUpUploadSessionMeta | null;
    if (!full || full.autoEnqueueFila === false || isFilaEnqueueComplete(full)) continue;

    let loops = 0;
    while (loops < 8) {
      loops += 1;
      const r = await runAutoEnqueueForSnapshot(snap.downloadJobId);
      if (!r) break;
      enqueues.push({
        downloadJobId: snap.downloadJobId,
        ok: r.ok,
        done: r.done,
        tracksImported: r.tracksImported,
        error: r.ok ? undefined : r.error,
      });
      if (!r.ok || r.done) break;
    }
  }

  return { download, enqueues };
}
