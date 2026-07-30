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

/** @deprecated Prefer track-based chunking — kept for API compat. */
export const SERVIDOR_UP_ENQUEUE_LOTE_CHUNK = 1;
/** Faixas por request Netlify (~26s). Pastas grandes (100+ fx) exigem isso. */
export const SERVIDOR_UP_MAX_TRACKS_PER_CHUNK = 20;

export type ServidorUpFilaEnqueueState = {
  jobIds: string[];
  lotesDone: number;
  lotesTotal: number;
  /** Faixas já enfileiradas (retomada após 504). */
  tracksDone?: number;
  tracksTotal?: number;
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
  /** Índice do primeiro lote neste chunk (legado). */
  loteOffset?: number;
  loteLimit?: number;
  /** Índice da primeira faixa no plano achatado (preferido). */
  trackOffset?: number;
  maxTracks?: number;
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
  tracksTotal: number;
  tracksProcessed: number;
  tracksRemaining: number;
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
  const withIds = arquivos.filter((a) => a.downloadItemId);
  const idList = withIds.map((a) => a.downloadItemId!);
  const dlById = new Map<
    string,
    { id: string; arquivoNome: string; titulo: string; artista: string; sizeBytes: number | null }
  >();
  if (idList.length > 0) {
    const rows = await prisma.downloadItem.findMany({
      where: {
        id: { in: idList },
        status: "concluido",
        storageKey: { not: null },
        NOT: { providerRef: { startsWith: "import:" } },
      },
      select: { id: true, arquivoNome: true, titulo: true, artista: true, sizeBytes: true },
    });
    for (const dl of rows) dlById.set(dl.id, dl);
  }

  const out: Array<{ nome: string; sizeBytes?: number; downloadItemId?: string }> = [];
  for (const a of arquivos) {
    if (!a.downloadItemId && !a.nome?.trim()) continue;
    if (a.downloadItemId) {
      const dl = dlById.get(a.downloadItemId);
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

type FlatTrackEntry = {
  lote: UploadLoteInput;
  arquivo: NonNullable<UploadLoteInput["arquivos"]>[number];
};

function flattenUploadLotes(rawLotes: UploadLoteInput[]): FlatTrackEntry[] {
  const flat: FlatTrackEntry[] = [];
  for (const lote of rawLotes) {
    for (const arquivo of lote.arquivos ?? []) {
      if (arquivo.downloadItemId || arquivo.nome?.trim()) {
        flat.push({ lote, arquivo });
      }
    }
  }
  return flat;
}

function groupFlatTracksToLotes(entries: FlatTrackEntry[]): UploadLoteInput[] {
  const byKey = new Map<string, UploadLoteInput>();
  for (const { lote, arquivo } of entries) {
    const key = `${lote.clienteRef ?? ""}:${lote.programacaoId ?? ""}:${lote.pastaId ?? ""}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.arquivos = [...(prev.arquivos ?? []), arquivo];
      continue;
    }
    byKey.set(key, {
      ...lote,
      arquivos: [arquivo],
    });
  }
  return [...byKey.values()];
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
  const maxTracks = Math.min(
    50,
    Math.max(1, input.maxTracks ?? SERVIDOR_UP_MAX_TRACKS_PER_CHUNK),
  );
  const trackOffset = Math.max(
    0,
    input.trackOffset ?? 0,
  );

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
      tracksTotal: 0,
      tracksProcessed: 0,
      tracksRemaining: 0,
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
      tracksTotal: 0,
      tracksProcessed: trackOffset,
      tracksRemaining: 0,
      unmatched: plan.unmatchedTracks.slice(0, 30),
      done: false,
    };
  }

  const rawLotes = servidorUpPlanToUploadLotes(plan, input.titulo);
  const lotesTotal = rawLotes.length;
  const flat = flattenUploadLotes(rawLotes);
  const tracksTotal = flat.length;

  if (tracksTotal === 0) {
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
      tracksTotal: 0,
      tracksProcessed: 0,
      tracksRemaining: 0,
      unmatched: plan.unmatchedTracks.slice(0, 30),
      done: false,
    };
  }

  if (trackOffset >= tracksTotal) {
    return {
      ok: true,
      jobIds: [],
      stagingImported: 0,
      stagingErrors: [],
      lotesTotal,
      lotesProcessed: lotesTotal,
      lotesRemaining: 0,
      tracksImported: 0,
      tracksTotal,
      tracksProcessed: tracksTotal,
      tracksRemaining: 0,
      unmatched: plan.unmatchedTracks.slice(0, 30),
      done: true,
    };
  }

  const flatSlice = flat.slice(trackOffset, trackOffset + maxTracks);
  const slice = groupFlatTracksToLotes(flatSlice);

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
      lotesProcessed: 0,
      lotesRemaining: lotesTotal,
      tracksImported: 0,
      tracksTotal,
      tracksProcessed: trackOffset,
      tracksRemaining: Math.max(0, tracksTotal - trackOffset),
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
        lotesProcessed: 0,
        lotesRemaining: lotesTotal,
        tracksImported: 0,
        tracksTotal,
        tracksProcessed: trackOffset,
        tracksRemaining: Math.max(0, tracksTotal - trackOffset),
        unmatched: plan.unmatchedTracks.slice(0, 30),
        done: false,
      };
    }
  }

  await applyPendingUploadTags(80).catch(() => {});

  const tracksProcessed = trackOffset + flatSlice.length;
  const tracksRemaining = Math.max(0, tracksTotal - tracksProcessed);
  const done = tracksRemaining === 0;

  return {
    ok: true,
    jobIds: jobs.map((j) => j.id),
    stagingImported,
    stagingErrors,
    lotesTotal,
    lotesProcessed: lotesTotal,
    lotesRemaining: 0,
    tracksImported: stagingImported,
    tracksTotal,
    tracksProcessed,
    tracksRemaining,
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
  const trackOffset = snapshot.filaEnqueue?.tracksDone ?? 0;

  const result = await enqueueServidorUpFilaChunk({
    downloadJobId,
    titulo: snapshot.titulo,
    hierarchyRows: snapshot.hierarchyRows,
    drafts: snapshot.drafts,
    tracks: snapshot.tracks,
    uploaderEmail,
    uploaderDisplayName,
    trackOffset,
  });

  const prev = snapshot.filaEnqueue;
  const nextState: ServidorUpFilaEnqueueState = {
    jobIds: [...(prev?.jobIds ?? []), ...result.jobIds],
    lotesDone: result.lotesProcessed,
    lotesTotal: result.lotesTotal,
    tracksDone: result.tracksProcessed,
    tracksTotal: result.tracksTotal,
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
