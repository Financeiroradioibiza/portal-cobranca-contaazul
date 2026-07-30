import { resolveTagCriativoUser } from "@/lib/criacao/criativoUserService";
import { markCriativoEntregueAuto, markSubidaFilaPainel } from "@/lib/criacao/atualizacaoPainelService";
import { abrirAtualizacao } from "@/lib/criacao/atualizacaoService";
import { createUploadJobsBatch, type UploadLoteInput } from "@/lib/criacao/filaService";
import { ingestFromStagingOnCloud2 } from "@/lib/criacao/ingestFromStaging";
import { applyPendingUploadTags } from "@/lib/criacao/uploadTagService";
import { appendLegacyMixSuffixToMp3Nome } from "@/lib/criacao/legacyMixFilename";
import {
  buildServidorUpUploadPlan,
  filterServidorUpPlanTracks,
  servidorUpPlanToUploadLotes,
  type ServidorUpUploadPlan,
} from "@/lib/criacao/servidorUpUploadService";
import {
  buildTrackToDownloadIndexMap,
  foldMatchKey,
  legacyStemArtistTitle,
} from "@/lib/criacao/servidorUpUploadReconcile";
import type { ServidorUpUploadTrackInput } from "@/lib/criacao/servidorUpUploadService";
import {
  getServidorUpUploadSnapshot,
  saveServidorUpUploadSnapshot,
} from "@/lib/criacao/servidorUpUploadSnapshotService";
import type { ServidorUpUploadSession } from "@/lib/criacao/servidorUpUploadSession";
import type { ServidorUpFilaEnqueueState } from "@/lib/criacao/servidorUpEnqueueFilaService";
import { SERVIDOR_UP_MAX_TRACKS_PER_CHUNK } from "@/lib/criacao/servidorUpEnqueueFilaService";
import { prisma } from "@/lib/prisma";

export type ServidorUpRecoverMissingResult = {
  ok: boolean;
  error?: string;
  messages?: string[];
  downloadJobId: string;
  sessionTracks: number;
  planMatched: number;
  alreadyEnqueued: number;
  missingBefore: number;
  enqueuedNow: number;
  stagingImported: number;
  stagingErrors: string[];
  jobIds: string[];
  byPasta: Array<{ pastaNome: string; missing: number; enqueued: number }>;
  unmatchedRemaining: number;
};

async function collectAlreadyEnqueuedRelativePaths(
  downloadJobId: string,
  tracks: ServidorUpUploadTrackInput[],
  filaJobIds: string[],
  extraPaths?: Set<string>,
): Promise<Set<string>> {
  const allJobItems = await prisma.downloadItem.findMany({
    where: { jobId: downloadJobId, status: "concluido", storageKey: { not: null } },
    select: {
      id: true,
      providerRef: true,
      createdAt: true,
      linhaOriginal: true,
      titulo: true,
      artista: true,
      arquivoNome: true,
      sizeBytes: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const indexMap = buildTrackToDownloadIndexMap(tracks, allJobItems);
  const importedIds = new Set(
    allJobItems.filter((i) => i.providerRef.startsWith("import:")).map((i) => i.id),
  );
  const enqueued = new Set<string>();
  for (const track of tracks) {
    const dl = indexMap.get(track.relativePath);
    if (dl && importedIds.has(dl.id)) enqueued.add(track.relativePath);
  }

  if (filaJobIds.length > 0) {
    const procItems = await prisma.processamentoItem.findMany({
      where: { jobId: { in: filaJobIds } },
      select: { arquivoNome: true },
    });
    const procKeys = new Set(procItems.map((i) => foldMatchKey(i.arquivoNome.replace(/\.mp3$/i, ""))));
    for (const track of tracks) {
      const leg = legacyStemArtistTitle(track.relativePath);
      if (!leg) continue;
      const synthetic = foldMatchKey(`${leg.artista} - ${leg.titulo}`);
      if (procKeys.has(synthetic)) enqueued.add(track.relativePath);
    }
  }

  if (extraPaths) {
    for (const p of extraPaths) enqueued.add(p);
  }

  return enqueued;
}

function filterMissingFromPlan(
  plan: ServidorUpUploadPlan,
  enqueuedRelativePaths: Set<string>,
): ServidorUpUploadPlan {
  return filterServidorUpPlanTracks(plan, { excludeRelativePaths: enqueuedRelativePaths });
}

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
      if (!dl) continue;
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

/** Enfileira faixas do snapshot que ainda não entraram na fila (recuperação pós-migração). */
export async function recoverServidorUpMissingTracks(
  downloadJobId: string,
  opts?: {
    uploaderEmail?: string;
    uploaderDisplayName?: string;
    maxTracks?: number;
    dryRun?: boolean;
  },
): Promise<ServidorUpRecoverMissingResult> {
  const snapshot = (await getServidorUpUploadSnapshot(downloadJobId)) as
    | (ServidorUpUploadSession & { filaEnqueue?: ServidorUpFilaEnqueueState })
    | null;

  if (!snapshot?.tracks?.length) {
    return {
      ok: false,
      error: "snapshot_nao_encontrado",
      downloadJobId,
      sessionTracks: 0,
      planMatched: 0,
      alreadyEnqueued: 0,
      missingBefore: 0,
      enqueuedNow: 0,
      stagingImported: 0,
      stagingErrors: [],
      jobIds: [],
      byPasta: [],
      unmatchedRemaining: 0,
    };
  }

  const fullPlan = await buildServidorUpUploadPlan({
    downloadJobId: snapshot.downloadJobId,
    hierarchyRows: snapshot.hierarchyRows,
    drafts: snapshot.drafts ?? {},
    tracks: snapshot.tracks,
  });

  if (fullPlan.hierarchyErrors.length > 0) {
    return {
      ok: false,
      error: "hierarquia_incompleta",
      messages: fullPlan.hierarchyErrors.slice(0, 10),
      downloadJobId,
      sessionTracks: snapshot.tracks.length,
      planMatched: fullPlan.lotes.reduce((n, l) => n + l.tracks.length, 0),
      alreadyEnqueued: 0,
      missingBefore: 0,
      enqueuedNow: 0,
      stagingImported: 0,
      stagingErrors: [],
      jobIds: [],
      byPasta: [],
      unmatchedRemaining: fullPlan.unmatchedTracks.length,
    };
  }

  const enqueuedPaths = await collectAlreadyEnqueuedRelativePaths(
    downloadJobId,
    snapshot.tracks,
    snapshot.filaEnqueue?.jobIds ?? [],
    new Set(snapshot.filaEnqueue?.enqueuedRelativePaths ?? []),
  );
  const missingPlan = filterMissingFromPlan(fullPlan, enqueuedPaths);

  const missingBefore = missingPlan.lotes.reduce((n, l) => n + l.tracks.length, 0);
  const planMatched = fullPlan.lotes.reduce((n, l) => n + l.tracks.length, 0);

  const byPastaBefore = fullPlan.lotes.map((l) => {
    const missingLote = missingPlan.lotes.find((m) => m.pastaId === l.pastaId);
    return {
      pastaNome: l.pastaNome,
      missing: missingLote?.tracks.length ?? 0,
      enqueued: 0,
    };
  });

  if (missingBefore === 0) {
    return {
      ok: true,
      downloadJobId,
      sessionTracks: snapshot.tracks.length,
      planMatched,
      alreadyEnqueued: enqueuedPaths.size,
      missingBefore: 0,
      enqueuedNow: 0,
      stagingImported: 0,
      stagingErrors: [],
      jobIds: [],
      byPasta: byPastaBefore,
      unmatchedRemaining: fullPlan.unmatchedTracks.length,
      messages: ["Nenhuma faixa pendente para recuperar."],
    };
  }

  if (opts?.dryRun) {
    return {
      ok: true,
      downloadJobId,
      sessionTracks: snapshot.tracks.length,
      planMatched,
      alreadyEnqueued: enqueuedPaths.size,
      missingBefore,
      enqueuedNow: 0,
      stagingImported: 0,
      stagingErrors: [],
      jobIds: [],
      byPasta: byPastaBefore,
      unmatchedRemaining: fullPlan.unmatchedTracks.length,
      messages: [`Dry-run: ${missingBefore} faixa(s) seriam enfileiradas.`],
    };
  }

  const maxTracks = Math.min(500, Math.max(1, opts?.maxTracks ?? 500));
  const limitedPlan: ServidorUpUploadPlan = {
    ...missingPlan,
    lotes: [],
  };
  let remaining = maxTracks;
  for (const lote of missingPlan.lotes) {
    if (remaining <= 0) break;
    const slice = lote.tracks.slice(0, remaining);
    if (slice.length === 0) continue;
    limitedPlan.lotes.push({ ...lote, tracks: slice });
    remaining -= slice.length;
  }

  const rawLotes = servidorUpPlanToUploadLotes(limitedPlan, snapshot.titulo);
  const uploaderEmail = opts?.uploaderEmail?.trim() || snapshot.enqueuedByEmail?.trim() || "servidor-up@portal";
  const uploaderDisplayName =
    opts?.uploaderDisplayName?.trim() || snapshot.enqueuedByDisplayName?.trim() || "Servidor UP";

  const lotes: UploadLoteInput[] = [];
  for (const l of rawLotes) {
    let arquivos = l.arquivos ?? [];
    arquivos = await normalizeUploadArquivos(arquivos);
    if (arquivos.length === 0) continue;
    const tagCriativo = await resolveTagCriativoUser(l.criativoUserId, uploaderEmail);
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
      downloadJobId,
      sessionTracks: snapshot.tracks.length,
      planMatched,
      alreadyEnqueued: enqueuedPaths.size,
      missingBefore,
      enqueuedNow: 0,
      stagingImported: 0,
      stagingErrors: [],
      jobIds: [],
      byPasta: byPastaBefore,
      unmatchedRemaining: fullPlan.unmatchedTracks.length,
    };
  }

  const jobs = await createUploadJobsBatch(lotes, {
    criativoNome: uploaderDisplayName,
    criativoUserId: uploaderEmail,
  });

  for (const job of jobs) {
    if (job.programacaoId) {
      await markSubidaFilaPainel(job.programacaoId, job.id, uploaderDisplayName);
      await markCriativoEntregueAuto(job.programacaoId, uploaderDisplayName);
    }
  }

  for (const progId of new Set(jobs.map((j) => j.programacaoId).filter(Boolean) as string[])) {
    await abrirAtualizacao(progId, uploaderDisplayName);
  }

  const stagingPairs: { processamentoItemId: string; downloadItemId: string }[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!;
    const arquivos = lotes[i]?.arquivos ?? [];
    for (let j = 0; j < job.itens.length; j++) {
      const dlId = arquivos[j]?.downloadItemId;
      if (dlId) stagingPairs.push({ processamentoItemId: job.itens[j]!.id, downloadItemId: dlId });
    }
  }

  let stagingImported = 0;
  let stagingErrors: string[] = [];
  if (stagingPairs.length > 0) {
    const stagingResult = await ingestFromStagingOnCloud2(stagingPairs);
    stagingImported = stagingResult.imported;
    stagingErrors = stagingResult.errors;
    // Jobs já criados — staging pode ser reimportado depois (recover staging).
  }

  await applyPendingUploadTags(80).catch(() => {});

  const enqueuedNow = limitedPlan.lotes.reduce((n, l) => n + l.tracks.length, 0);
  const newRelativePaths = limitedPlan.lotes.flatMap((l) => l.tracks.map((t) => t.relativePath));
  const prev = snapshot.filaEnqueue;
  const nextState: ServidorUpFilaEnqueueState = {
    jobIds: [...(prev?.jobIds ?? []), ...jobs.map((j) => j.id)],
    lotesDone: prev?.lotesDone ?? 0,
    lotesTotal: prev?.lotesTotal ?? fullPlan.lotes.length,
    tracksDone: (prev?.tracksDone ?? 0) + enqueuedNow,
    tracksTotal: planMatched,
    tracksImported: (prev?.tracksImported ?? 0) + stagingImported,
    startedAt: prev?.startedAt ?? Date.now(),
    finishedAt: enqueuedNow >= missingBefore ? Date.now() : undefined,
    lastError: stagingErrors.length > 0 ? stagingErrors[0] ?? null : null,
    enqueuedRelativePaths: [...(prev?.enqueuedRelativePaths ?? []), ...newRelativePaths],
  };

  await saveServidorUpUploadSnapshot(downloadJobId, {
    ...snapshot,
    filaEnqueue: nextState,
    enqueuedByEmail: uploaderEmail,
    enqueuedByDisplayName: uploaderDisplayName,
    savedAt: Date.now(),
  } as ServidorUpUploadSession);

  const byPasta = byPastaBefore.map((row) => {
    const enqueued = limitedPlan.lotes.find((l) => l.pastaNome === row.pastaNome)?.tracks.length ?? 0;
    return { ...row, enqueued };
  });

  return {
    ok: stagingErrors.length === 0 || stagingImported > 0,
    error: stagingImported === 0 && stagingErrors.length > 0 ? "staging_import_parcial" : undefined,
    messages:
      stagingImported === 0 && stagingErrors.length > 0 ?
        [`Fila criada; staging pendente (${stagingErrors[0] ?? "erro"}). Use recover staging ou rode na Netlify.`]
      : undefined,
    downloadJobId,
    sessionTracks: snapshot.tracks.length,
    planMatched,
    alreadyEnqueued: enqueuedPaths.size,
    missingBefore,
    enqueuedNow,
    stagingImported,
    stagingErrors,
    jobIds: jobs.map((j) => j.id),
    byPasta,
    unmatchedRemaining: fullPlan.unmatchedTracks.length,
  };
}

/** Recupera em chunks (Netlify-safe) até esgotar pendentes ou atingir maxRounds. */
export async function recoverServidorUpMissingTracksAll(
  downloadJobId: string,
  opts?: { maxRounds?: number; uploaderEmail?: string; uploaderDisplayName?: string },
): Promise<ServidorUpRecoverMissingResult> {
  const maxRounds = Math.min(50, Math.max(1, opts?.maxRounds ?? 30));
  let last: ServidorUpRecoverMissingResult | null = null;
  let totalEnqueued = 0;
  let totalStaging = 0;
  const allJobIds: string[] = [];

  for (let round = 0; round < maxRounds; round++) {
    const r = await recoverServidorUpMissingTracks(downloadJobId, {
      uploaderEmail: opts?.uploaderEmail,
      uploaderDisplayName: opts?.uploaderDisplayName,
      maxTracks: SERVIDOR_UP_MAX_TRACKS_PER_CHUNK,
    });
    last = r;
    if (r.missingBefore === 0 || r.enqueuedNow === 0) break;
    if (!r.ok && r.enqueuedNow === 0) break;
    totalEnqueued += r.enqueuedNow;
    totalStaging += r.stagingImported;
    allJobIds.push(...r.jobIds);
  }

  if (!last) {
    return {
      ok: false,
      error: "snapshot_nao_encontrado",
      downloadJobId,
      sessionTracks: 0,
      planMatched: 0,
      alreadyEnqueued: 0,
      missingBefore: 0,
      enqueuedNow: 0,
      stagingImported: 0,
      stagingErrors: [],
      jobIds: [],
      byPasta: [],
      unmatchedRemaining: 0,
    };
  }

  return {
    ...last,
    enqueuedNow: totalEnqueued,
    stagingImported: totalStaging,
    jobIds: allJobIds,
    messages: [
      ...(last.messages ?? []),
      totalEnqueued > 0 ? `Recuperação: +${totalEnqueued} faixa(s) enfileirada(s).` : "Nada a recuperar.",
    ],
  };
}
