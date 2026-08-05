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
/** Night-worker / cron — bloco curto para caber em ~90s (evita 504). */
export const SERVIDOR_UP_NIGHT_WORKER_MAX_TRACKS = 12;
export const SERVIDOR_UP_NIGHT_WORKER_DOWNLOAD_LIMIT = 8;
export const SERVIDOR_UP_NIGHT_WORKER_STAGING_BATCH = 24;

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
  /** Relative paths já enfileirados (evita duplicata se staging falhar). */
  enqueuedRelativePaths?: string[];
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
  /** Índice da primeira faixa no plano achatado (legado — preferir excludeRelativePaths). */
  trackOffset?: number;
  maxTracks?: number;
  /** Faixas já enfileiradas — evita reprocessar após 504 (substitui trackOffset). */
  excludeRelativePaths?: string[];
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
  /** Paths enfileirados neste chunk (para retomada após 504). */
  enqueuedRelativePaths?: string[];
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
  relativePath: string;
  lote: UploadLoteInput;
  arquivo: NonNullable<UploadLoteInput["arquivos"]>[number];
};

function flattenPlanTracks(
  plan: Awaited<ReturnType<typeof buildServidorUpUploadPlan>>,
  titulo: string,
): FlatTrackEntry[] {
  const rawLotes = servidorUpPlanToUploadLotes(plan, titulo);
  const flat: FlatTrackEntry[] = [];
  let rawIdx = 0;
  for (const lote of plan.lotes) {
    if (lote.tracks.length === 0) continue;
    const uploadLote = rawLotes[rawIdx];
    rawIdx += 1;
    if (!uploadLote) continue;
    const arquivos = uploadLote.arquivos ?? [];
    for (let i = 0; i < lote.tracks.length; i++) {
      const arquivo = arquivos[i];
      if (!arquivo?.downloadItemId && !arquivo?.nome?.trim()) continue;
      flat.push({
        relativePath: lote.tracks[i]!.relativePath,
        lote: uploadLote,
        arquivo,
      });
    }
  }
  return flat;
}

function flattenUploadLotes(rawLotes: UploadLoteInput[]): FlatTrackEntry[] {
  const flat: FlatTrackEntry[] = [];
  for (const lote of rawLotes) {
    for (const arquivo of lote.arquivos ?? []) {
      if (arquivo.downloadItemId || arquivo.nome?.trim()) {
        flat.push({ relativePath: "", lote, arquivo });
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
  erro: number;
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
  const erro = map.get("erro") ?? 0;
  return {
    pending,
    processing,
    ok,
    erro,
    total: job?.totalItens ?? pending + processing + ok + erro,
    jobStatus: job?.status ?? "desconhecido",
  };
}

/** Deemix terminou — nada aguardando/processando e todos os itens em estado terminal. */
export function isDeemixJobSettled(dl: Awaited<ReturnType<typeof countDownloadJobPending>>): boolean {
  if (dl.pending + dl.processing > 0) return false;
  if (dl.total <= 0) return false;
  return dl.ok + dl.erro >= dl.total || dl.jobStatus === "concluido";
}

async function persistFilaEnqueueState(
  downloadJobId: string,
  snapshot: ServidorUpUploadSessionMeta,
  patch: Partial<ServidorUpFilaEnqueueState>,
): Promise<ServidorUpFilaEnqueueState> {
  const prev = snapshot.filaEnqueue;
  const next: ServidorUpFilaEnqueueState = {
    jobIds: prev?.jobIds ?? [],
    lotesDone: prev?.lotesDone ?? 0,
    lotesTotal: prev?.lotesTotal ?? 0,
    tracksDone: prev?.tracksDone ?? 0,
    tracksTotal: prev?.tracksTotal ?? snapshot.tracks?.length ?? 0,
    tracksImported: prev?.tracksImported ?? 0,
    startedAt: prev?.startedAt ?? Date.now(),
    finishedAt: undefined,
    lastError: prev?.lastError ?? null,
    enqueuedRelativePaths: prev?.enqueuedRelativePaths,
    ...patch,
  };
  await saveServidorUpUploadSnapshot(downloadJobId, {
    ...snapshot,
    filaEnqueue: next,
    savedAt: Date.now(),
  } as ServidorUpUploadSession);
  return next;
}

export function isFilaEnqueueComplete(session: ServidorUpUploadSessionMeta): boolean {
  return Boolean(session.filaEnqueue?.finishedAt);
}

/**
 * `finishedAt` sozinho mentia quando o Deemix ainda tinha MP3 em staging
 * (ex.: auto-enqueue fechou com 582 e sobraram ~393). Só considera completo
 * se não houver faixas do snapshot ainda fora da fila.
 */
export async function isFilaEnqueueFullyComplete(
  downloadJobId: string,
  _session: ServidorUpUploadSessionMeta,
): Promise<boolean> {
  const { recoverServidorUpMissingTracks } = await import(
    "@/lib/criacao/servidorUpRecoverMissingService"
  );
  const dry = await recoverServidorUpMissingTracks(downloadJobId, { dryRun: true }).catch(
    () => null,
  );
  if (!dry) return false;
  return dry.missingBefore === 0;
}

export async function enqueueServidorUpFilaChunk(
  input: ServidorUpEnqueueChunkInput,
): Promise<ServidorUpEnqueueChunkResult> {
  const maxTracks = Math.min(
    50,
    Math.max(1, input.maxTracks ?? SERVIDOR_UP_MAX_TRACKS_PER_CHUNK),
  );
  const exclude = new Set(input.excludeRelativePaths ?? []);

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
      tracksProcessed: exclude.size,
      tracksRemaining: 0,
      unmatched: plan.unmatchedTracks.slice(0, 30),
      done: false,
    };
  }

  const rawLotes = servidorUpPlanToUploadLotes(plan, input.titulo);
  const lotesTotal = rawLotes.length;
  const flatAll = flattenPlanTracks(plan, input.titulo);
  const flat = flatAll.filter((e) => !exclude.has(e.relativePath));
  const tracksTotal = flatAll.length;

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

  if (flat.length === 0) {
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
      tracksProcessed: exclude.size,
      tracksRemaining: 0,
      unmatched: plan.unmatchedTracks.slice(0, 30),
      done: exclude.size >= tracksTotal,
    };
  }

  const flatSlice = flat.slice(0, maxTracks);
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
      tracksProcessed: exclude.size,
      tracksRemaining: Math.max(0, flat.length),
      unmatched: plan.unmatchedTracks.slice(0, 30),
      done: false,
    };
  }

  const newPaths = flatSlice.map((e) => e.relativePath);

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
        tracksProcessed: exclude.size,
        tracksRemaining: Math.max(0, flat.length),
        unmatched: plan.unmatchedTracks.slice(0, 30),
        done: false,
      };
    }
  }

  await applyPendingUploadTags(80).catch(() => {});

  const tracksProcessed = exclude.size + flatSlice.length;
  const tracksRemaining = Math.max(0, flat.length - flatSlice.length);
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
    enqueuedRelativePaths: newPaths,
  };
}

export async function runAutoEnqueueForSnapshot(
  downloadJobId: string,
  opts?: { force?: boolean; maxTracks?: number },
): Promise<ServidorUpEnqueueChunkResult | null> {
  let snapshot = (await getServidorUpUploadSnapshot(downloadJobId)) as ServidorUpUploadSessionMeta | null;
  if (!snapshot) return null;
  if (snapshot.autoEnqueueFila === false) return null;

  const maxTracks = Math.min(
    50,
    Math.max(1, opts?.maxTracks ?? SERVIDOR_UP_MAX_TRACKS_PER_CHUNK),
  );
  const uploaderEmail = snapshot.enqueuedByEmail?.trim() || "servidor-up@portal";
  const uploaderDisplayName = snapshot.enqueuedByDisplayName?.trim() || "Servidor UP";

  /** `finishedAt` prematuro (504) — limpa e retoma. */
  if (isFilaEnqueueComplete(snapshot) && !opts?.force) {
    const fullyDone = await isFilaEnqueueFullyComplete(downloadJobId, snapshot);
    if (fullyDone) return null;
    await persistFilaEnqueueState(downloadJobId, snapshot, { finishedAt: undefined });
    snapshot = (await getServidorUpUploadSnapshot(downloadJobId)) as ServidorUpUploadSessionMeta | null;
    if (!snapshot) return null;
  }

  const dl = await countDownloadJobPending(downloadJobId);
  if (!isDeemixJobSettled(dl)) return null;
  if (dl.ok <= 0) return null;

  const excludePaths = [...(snapshot.filaEnqueue?.enqueuedRelativePaths ?? [])];
  const prev = snapshot.filaEnqueue;

  let result = await enqueueServidorUpFilaChunk({
    downloadJobId,
    titulo: snapshot.titulo,
    hierarchyRows: snapshot.hierarchyRows,
    drafts: snapshot.drafts,
    tracks: snapshot.tracks,
    uploaderEmail,
    uploaderDisplayName,
    excludeRelativePaths: excludePaths,
    maxTracks,
  });

  let mergedPaths = [...new Set([...excludePaths, ...(result.enqueuedRelativePaths ?? [])])];
  let jobIds = [...(prev?.jobIds ?? []), ...result.jobIds];
  let tracksImported = (prev?.tracksImported ?? 0) + result.tracksImported;

  /** Plano vazio mas recover ainda vê pendentes → um chunk de recover. */
  if (result.ok && result.tracksTotal === 0 && mergedPaths.length < (snapshot.tracks?.length ?? 0)) {
    const { recoverServidorUpMissingTracks } = await import(
      "@/lib/criacao/servidorUpRecoverMissingService"
    );
    const recovered = await recoverServidorUpMissingTracks(downloadJobId, {
      maxTracks,
      uploaderEmail,
      uploaderDisplayName,
    }).catch(() => null);
    if (recovered && recovered.enqueuedNow > 0) {
      jobIds = [...jobIds, ...recovered.jobIds];
      tracksImported += recovered.stagingImported;
      result = {
        ok: recovered.ok,
        error: recovered.error,
        messages: recovered.messages,
        jobIds: recovered.jobIds,
        stagingImported: recovered.stagingImported,
        stagingErrors: recovered.stagingErrors,
        lotesTotal: recovered.byPasta.length,
        lotesProcessed: recovered.byPasta.length,
        lotesRemaining: 0,
        tracksImported: recovered.stagingImported,
        tracksTotal: recovered.planMatched,
        tracksProcessed: recovered.alreadyEnqueued + recovered.enqueuedNow,
        tracksRemaining: recovered.missingBefore,
        unmatched: [],
        done: recovered.missingBefore === 0,
      };
      snapshot = (await getServidorUpUploadSnapshot(downloadJobId)) as ServidorUpUploadSessionMeta | null;
      mergedPaths = [...(snapshot?.filaEnqueue?.enqueuedRelativePaths ?? mergedPaths)];
    }
  } else if (result.ok && result.done) {
    const { recoverServidorUpMissingTracks } = await import(
      "@/lib/criacao/servidorUpRecoverMissingService"
    );
    const recovered = await recoverServidorUpMissingTracks(downloadJobId, {
      maxTracks,
      uploaderEmail,
      uploaderDisplayName,
    }).catch(() => null);
    if (recovered && recovered.enqueuedNow > 0) {
      jobIds = [...jobIds, ...recovered.jobIds];
      tracksImported += recovered.stagingImported;
      result = {
        ...result,
        tracksRemaining: recovered.missingBefore,
        done: recovered.missingBefore === 0,
      };
      snapshot = (await getServidorUpUploadSnapshot(downloadJobId)) as ServidorUpUploadSessionMeta | null;
      mergedPaths = [...(snapshot?.filaEnqueue?.enqueuedRelativePaths ?? mergedPaths)];
    }
  }

  const fullyDone = snapshot ? await isFilaEnqueueFullyComplete(downloadJobId, snapshot) : false;

  if (!snapshot) return null;

  const fresh = (await getServidorUpUploadSnapshot(downloadJobId)) as ServidorUpUploadSessionMeta | null;
  if (fresh) {
    snapshot = fresh;
    mergedPaths = [...(fresh.filaEnqueue?.enqueuedRelativePaths ?? mergedPaths)];
    jobIds = [...new Set([...(fresh.filaEnqueue?.jobIds ?? []), ...jobIds])];
    tracksImported = fresh.filaEnqueue?.tracksImported ?? tracksImported;
  }

  const nextState = await persistFilaEnqueueState(downloadJobId, snapshot, {
    jobIds,
    lotesDone: result.lotesProcessed,
    lotesTotal: result.lotesTotal,
    tracksDone: mergedPaths.length,
    tracksTotal: snapshot.tracks?.length ?? result.tracksTotal,
    tracksImported,
    finishedAt: fullyDone ? Date.now() : undefined,
    lastError:
      fullyDone ? null
      : result.ok ?
        result.tracksRemaining > 0 ?
          `fila_parcial: ${result.tracksRemaining} faixa(s) neste plano`
        : null
      : result.error ?? result.messages?.[0] ?? "erro",
    enqueuedRelativePaths: mergedPaths,
  });

  return {
    ...result,
    done: Boolean(nextState.finishedAt),
    tracksRemaining: nextState.finishedAt ? 0 : result.tracksRemaining,
  };
}

export async function runServidorUpNightWorker(opts?: {
  downloadLimit?: number;
  maxSnapshots?: number;
  /** Só estes jobs Deemix (query param / env). Sem filtro → snapshots com autoEnqueue pendentes. */
  downloadJobIds?: string[];
}): Promise<{
  download: { triggered: boolean; processed?: number; error?: string };
  enqueues: Array<{ downloadJobId: string; ok: boolean; done?: boolean; tracksImported?: number; error?: string }>;
}> {
  const limit = Math.min(
    20,
    Math.max(1, opts?.downloadLimit ?? SERVIDOR_UP_NIGHT_WORKER_DOWNLOAD_LIMIT),
  );
  let download: { triggered: boolean; processed?: number; error?: string } =
    await triggerDownloadProcessing(limit, { timeoutMs: 28_000 }).catch((e: unknown) => ({
      triggered: false,
      processed: 0,
      error: e instanceof Error ? e.message : "erro_download",
    }));

  const snapshots = await listServidorUpUploadSnapshots(opts?.maxSnapshots ?? 10);
  const allowIds =
    opts?.downloadJobIds?.map((id) => id.trim()).filter(Boolean) ?? [];
  const enqueues: Array<{
    downloadJobId: string;
    ok: boolean;
    done?: boolean;
    tracksImported?: number;
    error?: string;
  }> = [];

  for (const snap of snapshots) {
    if (allowIds.length > 0 && !allowIds.includes(snap.downloadJobId)) continue;
    const full = (await getServidorUpUploadSnapshot(snap.downloadJobId)) as ServidorUpUploadSessionMeta | null;
    if (!full || full.autoEnqueueFila === false) continue;

    const fullyDone = await isFilaEnqueueFullyComplete(snap.downloadJobId, full);
    if (fullyDone) continue;

    const { ensureDeemixItemsForSnapshot } = await import("@/lib/criacao/servidorUpDeemixSyncService");
    await ensureDeemixItemsForSnapshot(snap.downloadJobId).catch(() => null);

    const r = await runAutoEnqueueForSnapshot(snap.downloadJobId, {
      maxTracks: SERVIDOR_UP_NIGHT_WORKER_MAX_TRACKS,
    });
    if (!r) continue;
    enqueues.push({
      downloadJobId: snap.downloadJobId,
      ok: r.ok,
      done: r.done,
      tracksImported: r.tracksImported,
      error: r.ok ? undefined : r.error,
    });

    const { recoverServidorUpStagingForDownloadJob } = await import(
      "@/lib/criacao/servidorUpRecoverStagingService"
    );
    await recoverServidorUpStagingForDownloadJob(snap.downloadJobId, {
      maxItems: SERVIDOR_UP_NIGHT_WORKER_STAGING_BATCH,
    }).catch(() => null);
  }

  return { download, enqueues };
}
