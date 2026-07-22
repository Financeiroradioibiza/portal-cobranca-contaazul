import { prisma } from "@/lib/prisma";
import { pathSegmentLooseKey } from "@/lib/criacao/pathSanitize";
import {
  ingestFromStagingOnCloud2,
  type StagingIngestPair,
} from "@/lib/criacao/ingestFromStaging";
import type { ServidorUpHierarchyRow } from "@/lib/criacao/servidorUpHierarchyService";
import { foldMatchKey } from "@/lib/criacao/servidorUpUploadReconcile";
import {
  buildServidorUpUploadPlan,
  servidorUpHierarchyKey,
  type ServidorUpUploadTrackInput,
} from "@/lib/criacao/servidorUpUploadService";
import type { ServidorUpUploadSession } from "@/lib/criacao/servidorUpUploadSession";

function parseArtistTitleFromArquivoNome(nome: string): { artista: string; titulo: string } | null {
  const base = nome.trim().replace(/\.mp3$/i, "").replace(/~\d+$/i, "").trim();
  const sep = base.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (!sep?.[1]?.trim() || !sep[2]?.trim()) return null;
  return { artista: sep[1].trim(), titulo: sep[2].trim() };
}

function hierarchyRowForTrack(
  track: ServidorUpUploadTrackInput,
  hierarchyByKey: Map<string, ServidorUpHierarchyRow>,
  hierarchyRows: ServidorUpHierarchyRow[],
): ServidorUpHierarchyRow | undefined {
  const key = servidorUpHierarchyKey(track);
  const direct = hierarchyByKey.get(key);
  if (direct) return direct;
  const looseCliente = pathSegmentLooseKey(track.clienteNome);
  const looseProg = pathSegmentLooseKey(track.programacaoNome);
  const loosePasta = pathSegmentLooseKey(track.pastaNome);
  return hierarchyRows.find(
    (r) =>
      pathSegmentLooseKey(r.clienteNome) === looseCliente &&
      pathSegmentLooseKey(r.programacaoNome) === looseProg &&
      pathSegmentLooseKey(r.pastaNome) === loosePasta,
  );
}

function sessionTracksForJob(
  session: ServidorUpUploadSession,
  job: { pastaId: string | null; programacaoId: string | null },
): ServidorUpUploadTrackInput[] {
  const hierarchyRows = session.hierarchyRows;
  const hierarchyByKey = new Map(hierarchyRows.map((r) => [r.key, r]));
  const out: ServidorUpUploadTrackInput[] = [];
  for (const track of session.tracks as ServidorUpUploadTrackInput[]) {
    const row = hierarchyRowForTrack(track, hierarchyByKey, hierarchyRows);
    if (job.pastaId && row?.pastaId !== job.pastaId) continue;
    if (job.programacaoId && row?.programacaoId !== job.programacaoId) continue;
    if (!job.pastaId && !job.programacaoId) continue;
    out.push(track);
  }
  return out;
}

async function countStagingReady(downloadJobId: string): Promise<number> {
  return prisma.downloadItem.count({
    where: {
      jobId: downloadJobId,
      status: "concluido",
      storageKey: { not: null },
      NOT: { providerRef: { startsWith: "import:" } },
    },
  });
}

function trackMatchesArquivoNome(
  track: { artista: string; titulo: string; arquivoNome: string },
  arquivoNome: string,
): boolean {
  const want = foldMatchKey(arquivoNome);
  if (foldMatchKey(track.arquivoNome) === want) return true;
  const synthetic = `${track.artista.trim()} - ${track.titulo.trim()}.mp3`;
  return foldMatchKey(synthetic) === want;
}

function findLoteInPlan(
  plan: Awaited<ReturnType<typeof buildServidorUpUploadPlan>>,
  job: { pastaId: string | null; programacaoId: string | null },
) {
  return plan.lotes.find((l) => {
    if (job.pastaId && l.pastaId !== job.pastaId) return false;
    if (job.programacaoId && l.programacaoId !== job.programacaoId) return false;
    return job.pastaId != null || job.programacaoId != null;
  });
}

async function findSnapshotForJob(job: {
  pastaId: string | null;
  programacaoId: string | null;
}): Promise<{ downloadJobId: string; session: ServidorUpUploadSession } | null> {
  const rows = await prisma.servidorUpUploadSnapshot.findMany({
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  let best: { downloadJobId: string; session: ServidorUpUploadSession; staging: number } | null = null;

  for (const row of rows) {
    const session = row.payload as ServidorUpUploadSession;
    if (!session?.downloadJobId || !Array.isArray(session.tracks) || !Array.isArray(session.hierarchyRows)) {
      continue;
    }
    if (sessionTracksForJob(session, job).length === 0) continue;

    const staging = await countStagingReady(session.downloadJobId);
    if (staging === 0) continue;

    if (!best || staging > best.staging) {
      best = { downloadJobId: session.downloadJobId, session, staging };
    }
  }

  if (!best) return null;
  return { downloadJobId: best.downloadJobId, session: best.session };
}

function pairsFromUploadPlan(
  job: {
    itens: Array<{
      id: string;
      arquivoNome: string;
      status: string;
      rawStorageKey: string | null;
    }>;
  },
  lote: NonNullable<ReturnType<typeof findLoteInPlan>>,
): StagingIngestPair[] {
  const pendingItems = job.itens.filter((i) => i.status === "aguardando" && !i.rawStorageKey);
  if (pendingItems.length === 0) return [];

  const pairs: StagingIngestPair[] = [];

  if (lote.tracks.length === pendingItems.length) {
    for (let i = 0; i < pendingItems.length; i++) {
      pairs.push({
        processamentoItemId: pendingItems[i]!.id,
        downloadItemId: lote.tracks[i]!.downloadItemId,
      });
    }
    return pairs;
  }

  const used = new Set<string>();
  for (const item of pendingItems) {
    const track = lote.tracks.find(
      (t) => !used.has(t.downloadItemId) && trackMatchesArquivoNome(t, item.arquivoNome),
    );
    if (!track) continue;
    used.add(track.downloadItemId);
    pairs.push({ processamentoItemId: item.id, downloadItemId: track.downloadItemId });
  }
  return pairs;
}

/** Reimporta staging para um job de upload (Pop Rock / Samba etc.) usando snapshot Servidor UP. */
export async function recoverStagingForJob(processamentoJobId: string): Promise<{
  imported: number;
  errors: string[];
}> {
  const job = await prisma.processamentoJob.findUnique({
    where: { id: processamentoJobId },
    select: {
      id: true,
      pastaId: true,
      programacaoId: true,
      itens: {
        select: { id: true, arquivoNome: true, status: true, rawStorageKey: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!job) return { imported: 0, errors: ["job_nao_encontrado"] };

  const pending = job.itens.filter((i) => i.status === "aguardando" && !i.rawStorageKey);
  if (pending.length === 0) return { imported: 0, errors: [] };

  const snap = await findSnapshotForJob(job);
  if (!snap) {
    return { imported: 0, errors: ["nenhum_par_staging_encontrado"] };
  }

  const plan = await buildServidorUpUploadPlan({
    downloadJobId: snap.downloadJobId,
    hierarchyRows: snap.session.hierarchyRows,
    drafts: snap.session.drafts ?? {},
    tracks: snap.session.tracks as ServidorUpUploadTrackInput[],
  });
  const lote = findLoteInPlan(plan, job);
  if (!lote?.tracks.length) {
    return { imported: 0, errors: ["nenhum_par_staging_encontrado"] };
  }

  const pairs = pairsFromUploadPlan(job, lote);
  if (pairs.length === 0) {
    return { imported: 0, errors: ["nenhum_par_staging_encontrado"] };
  }

  const r = await ingestFromStagingOnCloud2(pairs);
  return { imported: r.imported, errors: r.errors };
}

export async function recoverStagingForActiveUploadJobs(maxJobs = 12): Promise<{
  imported: number;
  errors: string[];
}> {
  const jobs = await prisma.processamentoJob.findMany({
    where: {
      status: { in: ["aguardando", "processando"] },
      itens: { some: { status: "aguardando", rawStorageKey: null } },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: maxJobs,
  });
  let imported = 0;
  const errors: string[] = [];
  for (const j of jobs) {
    const r = await recoverStagingForJob(j.id);
    imported += r.imported;
    if (r.errors.length) errors.push(...r.errors.slice(0, 3));
  }
  return { imported, errors: [...new Set(errors)].slice(0, 15) };
}

/** Itens sem MP3 no cloud2 — pareamento por snapshot ou artista/título. */
export async function recoverStagingForPendingItems(limit = 120): Promise<{
  imported: number;
  errors: string[];
}> {
  const byJob = await recoverStagingForActiveUploadJobs(8);
  if (byJob.imported > 0) return byJob;

  const items = await prisma.processamentoItem.findMany({
    where: {
      status: "aguardando",
      rawStorageKey: null,
      job: { status: { in: ["aguardando", "processando"] } },
    },
    select: { id: true, arquivoNome: true },
    take: limit,
    orderBy: { createdAt: "asc" },
  });
  if (items.length === 0) return { imported: 0, errors: [] };

  const pairs: StagingIngestPair[] = [];
  const usedDownloadIds = new Set<string>();

  for (const item of items) {
    const parsed = parseArtistTitleFromArquivoNome(item.arquivoNome.trim());
    if (!parsed) continue;
    const byMeta = await prisma.downloadItem.findFirst({
      where: {
        status: "concluido",
        storageKey: { not: null },
        NOT: { providerRef: { startsWith: "import:" } },
        artista: { equals: parsed.artista, mode: "insensitive" },
        titulo: { equals: parsed.titulo, mode: "insensitive" },
      },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
    });
    if (byMeta && !usedDownloadIds.has(byMeta.id)) {
      usedDownloadIds.add(byMeta.id);
      pairs.push({ processamentoItemId: item.id, downloadItemId: byMeta.id });
    }
  }

  if (pairs.length === 0) {
    return { imported: 0, errors: ["nenhum_par_staging_encontrado"] };
  }
  const r = await ingestFromStagingOnCloud2(pairs);
  return { imported: r.imported, errors: r.errors };
}
