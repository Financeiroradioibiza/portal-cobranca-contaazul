import { prisma } from "@/lib/prisma";
import {
  ingestFromStagingOnCloud2,
  type StagingIngestPair,
} from "@/lib/criacao/ingestFromStaging";
import {
  arquivoNomeMatchKey,
  buildTrackToDownloadIndexMap,
  foldMatchKey,
  legacyStemArtistTitle,
} from "@/lib/criacao/servidorUpUploadReconcile";
import {
  buildServidorUpUploadPlan,
  type ServidorUpUploadTrackInput,
} from "@/lib/criacao/servidorUpUploadService";
import { getServidorUpUploadSnapshot } from "@/lib/criacao/servidorUpUploadSnapshotService";

export type ServidorUpRecoverStagingResult = {
  ok: boolean;
  downloadJobId: string;
  pairsAttempted: number;
  imported: number;
  pendingBefore: number;
  errors: string[];
  byJob: Array<{ jobId: string; titulo: string; pending: number; paired: number }>;
};

type PlanTrackRef = {
  downloadItemId: string;
  relativePath: string;
  artista: string;
  titulo: string;
  arquivoNome: string;
};

function buildPlanTrackLookup(planTracks: PlanTrackRef[]): Map<string, PlanTrackRef> {
  const out = new Map<string, PlanTrackRef>();
  const put = (key: string, track: PlanTrackRef) => {
    if (!key || out.has(key)) return;
    out.set(key, track);
  };

  for (const track of planTracks) {
    put(arquivoNomeMatchKey(track.arquivoNome), track);
    put(arquivoNomeMatchKey(`${track.artista.trim()} - ${track.titulo.trim()}.mp3`), track);
    const leg = legacyStemArtistTitle(track.relativePath);
    if (leg) {
      put(arquivoNomeMatchKey(`${leg.artista} - ${leg.titulo}.mp3`), track);
    }
    put(foldMatchKey(track.relativePath), track);
  }
  return out;
}

function matchPlanTrack(
  arquivoNome: string,
  lookup: Map<string, PlanTrackRef>,
): PlanTrackRef | undefined {
  const direct = lookup.get(arquivoNomeMatchKey(arquivoNome));
  if (direct) return direct;

  const leg = legacyStemArtistTitle(arquivoNome);
  if (leg) {
    const byLeg = lookup.get(arquivoNomeMatchKey(`${leg.artista} - ${leg.titulo}.mp3`));
    if (byLeg) return byLeg;
  }
  return undefined;
}

/** Reimporta staging Deemix → cloud2 para jobs Servidor UP (pareamento por plano + índice global). */
export async function recoverServidorUpStagingForDownloadJob(
  downloadJobId: string,
  opts?: {
    maxItems?: number;
    processamentoJobIds?: string[];
  },
): Promise<ServidorUpRecoverStagingResult> {
  const snapshot = await getServidorUpUploadSnapshot(downloadJobId);
  if (!snapshot?.tracks?.length || !snapshot.hierarchyRows?.length) {
    return {
      ok: false,
      downloadJobId,
      pairsAttempted: 0,
      imported: 0,
      pendingBefore: 0,
      errors: ["snapshot_nao_encontrado"],
      byJob: [],
    };
  }

  const tracks = snapshot.tracks as ServidorUpUploadTrackInput[];
  const plan = await buildServidorUpUploadPlan({
    downloadJobId,
    hierarchyRows: snapshot.hierarchyRows,
    drafts: snapshot.drafts ?? {},
    tracks,
  });

  const planTracks: PlanTrackRef[] = plan.lotes.flatMap((l) =>
    l.tracks.map((t) => ({
      downloadItemId: t.downloadItemId,
      relativePath: t.relativePath,
      artista: t.artista,
      titulo: t.titulo,
      arquivoNome: t.arquivoNome,
    })),
  );
  const lookup = buildPlanTrackLookup(planTracks);

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
  const importedDownloadIds = new Set(
    allJobItems.filter((i) => i.providerRef.startsWith("import:")).map((i) => i.id),
  );

  const jobIdFilter =
    opts?.processamentoJobIds?.length ?
      opts.processamentoJobIds
    : (snapshot.filaEnqueue?.jobIds ?? []);

  const procJobs = await prisma.processamentoJob.findMany({
    where: {
      ...(jobIdFilter.length > 0 ? { id: { in: jobIdFilter } } : {}),
      status: { in: ["aguardando", "processando"] },
      itens: { some: { status: "aguardando", rawStorageKey: null } },
    },
    select: {
      id: true,
      titulo: true,
      itens: {
        where: { status: "aguardando", rawStorageKey: null },
        select: { id: true, arquivoNome: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const pendingBefore = procJobs.reduce((n, j) => n + j.itens.length, 0);
  if (pendingBefore === 0) {
    return {
      ok: true,
      downloadJobId,
      pairsAttempted: 0,
      imported: 0,
      pendingBefore: 0,
      errors: [],
      byJob: [],
    };
  }

  const maxItems = Math.min(500, Math.max(1, opts?.maxItems ?? 500));
  const pairs: StagingIngestPair[] = [];
  const usedDownloadIds = new Set<string>();
  const byJob: ServidorUpRecoverStagingResult["byJob"] = [];

  outer: for (const job of procJobs) {
    let paired = 0;
    for (const item of job.itens) {
      if (pairs.length >= maxItems) break outer;

      let downloadItemId: string | undefined;
      const planTrack = matchPlanTrack(item.arquivoNome, lookup);
      if (planTrack) {
        downloadItemId = planTrack.downloadItemId;
      } else {
        for (const track of tracks) {
          const leg = legacyStemArtistTitle(track.relativePath);
          if (!leg) continue;
          const itemKey = arquivoNomeMatchKey(item.arquivoNome);
          const trackKey = arquivoNomeMatchKey(`${leg.artista} - ${leg.titulo}.mp3`);
          if (itemKey === trackKey) {
            const indexed = indexMap.get(track.relativePath);
            if (indexed) downloadItemId = indexed.id;
            break;
          }
        }
      }

      if (!downloadItemId) continue;
      if (usedDownloadIds.has(downloadItemId)) continue;
      if (importedDownloadIds.has(downloadItemId)) continue;

      usedDownloadIds.add(downloadItemId);
      pairs.push({ processamentoItemId: item.id, downloadItemId });
      paired++;
    }
    byJob.push({
      jobId: job.id,
      titulo: job.titulo,
      pending: job.itens.length,
      paired,
    });
  }

  if (pairs.length === 0) {
    return {
      ok: false,
      downloadJobId,
      pairsAttempted: 0,
      imported: 0,
      pendingBefore,
      errors: ["nenhum_par_staging_encontrado"],
      byJob,
    };
  }

  const ingest = await ingestFromStagingOnCloud2(pairs);
  return {
    ok: ingest.imported > 0 || ingest.errors.length === 0,
    downloadJobId,
    pairsAttempted: pairs.length,
    imported: ingest.imported,
    pendingBefore,
    errors: ingest.errors,
    byJob,
  };
}

/** Varre todos os jobs ativos com itens sem rawStorageKey (fallback genérico). */
export async function recoverServidorUpStagingAll(opts?: {
  maxJobs?: number;
  maxItems?: number;
}): Promise<{ imported: number; errors: string[]; results: ServidorUpRecoverStagingResult[] }> {
  const snapshots = await prisma.servidorUpUploadSnapshot.findMany({
    orderBy: { updatedAt: "desc" },
    take: Math.min(10, Math.max(1, opts?.maxJobs ?? 5)),
    select: { downloadJobId: true },
  });

  const seen = new Set<string>();
  const results: ServidorUpRecoverStagingResult[] = [];
  let imported = 0;
  const errors: string[] = [];

  for (const row of snapshots) {
    const id = row.downloadJobId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const r = await recoverServidorUpStagingForDownloadJob(id, { maxItems: opts?.maxItems ?? 200 });
    results.push(r);
    imported += r.imported;
    if (r.errors.length) errors.push(...r.errors.slice(0, 3));
    if (imported >= (opts?.maxItems ?? 200)) break;
  }

  return { imported, errors: [...new Set(errors)].slice(0, 15), results };
}
