import { prisma } from "@/lib/prisma";
import {
  ingestFromStagingOnCloud2,
  type StagingIngestPair,
} from "@/lib/criacao/ingestFromStaging";

function parseArtistTitleFromArquivoNome(nome: string): { artista: string; titulo: string } | null {
  const base = nome.trim().replace(/\.mp3$/i, "").replace(/~\d+$/i, "").trim();
  const sep = base.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (!sep?.[1]?.trim() || !sep[2]?.trim()) return null;
  return { artista: sep[1].trim(), titulo: sep[2].trim() };
}

async function findDownloadItemForArquivoNome(
  arquivoNome: string,
  usedDownloadIds: Set<string>,
): Promise<string | null> {
  const parsed = parseArtistTitleFromArquivoNome(arquivoNome.trim());
  if (!parsed) return null;

  const byMeta = await prisma.downloadItem.findFirst({
    where: {
      id: usedDownloadIds.size > 0 ? { notIn: [...usedDownloadIds] } : undefined,
      status: "concluido",
      storageKey: { not: null },
      NOT: { providerRef: { startsWith: "import:" } },
      artista: { equals: parsed.artista, mode: "insensitive" },
      titulo: { equals: parsed.titulo, mode: "insensitive" },
    },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  return byMeta?.id ?? null;
}

async function buildPairsForPendingItems(
  items: Array<{ id: string; arquivoNome: string }>,
): Promise<StagingIngestPair[]> {
  const pairs: StagingIngestPair[] = [];
  const usedDownloadIds = new Set<string>();

  for (const item of items) {
    const downloadItemId = await findDownloadItemForArquivoNome(item.arquivoNome, usedDownloadIds);
    if (!downloadItemId) continue;
    usedDownloadIds.add(downloadItemId);
    pairs.push({ processamentoItemId: item.id, downloadItemId });
  }

  return pairs;
}

/** Reimporta staging para um job de upload (pareamento artista/título no Download link). */
export async function recoverStagingForJob(processamentoJobId: string): Promise<{
  imported: number;
  errors: string[];
}> {
  const job = await prisma.processamentoJob.findUnique({
    where: { id: processamentoJobId },
    select: {
      id: true,
      itens: {
        select: { id: true, arquivoNome: true, status: true, rawStorageKey: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!job) return { imported: 0, errors: ["job_nao_encontrado"] };

  const pending = job.itens.filter((i) => i.status === "aguardando" && !i.rawStorageKey);
  if (pending.length === 0) return { imported: 0, errors: [] };

  const pairs = await buildPairsForPendingItems(pending);
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

/** Itens sem MP3 no cloud2 — pareamento por artista/título do Download link. */
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

  const pairs = await buildPairsForPendingItems(items);
  if (pairs.length === 0) {
    return { imported: 0, errors: ["nenhum_par_staging_encontrado"] };
  }
  const r = await ingestFromStagingOnCloud2(pairs);
  return { imported: r.imported, errors: r.errors };
}
