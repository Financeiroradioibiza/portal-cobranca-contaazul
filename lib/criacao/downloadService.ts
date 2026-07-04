import type { DownloadProvider, DownloadJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  defaultJobTitulo,
  parseDownloadLines,
  type DownloadProviderId,
} from "@/lib/criacao/downloadParse";
import type { DownloadItemStatus } from "@prisma/client";

export type DownloadJobRow = {
  id: string;
  provider: DownloadProviderId;
  status: DownloadJobStatus;
  titulo: string;
  criativoNome: string;
  totalItens: number;
  itensFeitos: number;
  itensOk: number;
  itensErro: number;
  erroMsg: string;
  createdAt: string;
  finishedAt: string | null;
};

export type DownloadItemRow = {
  id: string;
  linhaOriginal: string;
  inputTipo: string;
  status: DownloadItemStatus;
  arquivoNome: string;
  titulo: string;
  artista: string;
  storageKey: string | null;
  sizeBytes: number | null;
  erroMsg: string;
  createdAt: string;
};

export type StagingFileRow = {
  id: string;
  jobId: string;
  provider: DownloadProviderId;
  arquivoNome: string;
  titulo: string;
  artista: string;
  sizeBytes: number | null;
  finishedAt: string | null;
};

export async function createDownloadJob(input: {
  provider: DownloadProviderId;
  titulo?: string;
  linhas: string;
  criativoNome: string;
  criativoUserId?: string;
}) {
  const parsed = parseDownloadLines(input.linhas, input.provider);
  if (parsed.length === 0) {
    throw new Error("nenhuma_linha");
  }

  const titulo =
    (input.titulo ?? "").trim().slice(0, 200) ||
    defaultJobTitulo(input.provider, parsed.length);

  const job = await prisma.downloadJob.create({
    data: {
      provider: input.provider as DownloadProvider,
      titulo,
      criativoNome: input.criativoNome.slice(0, 120),
      criativoUserId: input.criativoUserId?.slice(0, 200) || null,
      totalItens: parsed.length,
      itens: {
        create: parsed.map((p) => ({
          linhaOriginal: p.linhaOriginal.slice(0, 4000),
          inputTipo: p.inputTipo,
        })),
      },
    },
    include: { itens: { select: { id: true } } },
  });

  return job;
}

export async function listDownloadJobs(opts: {
  provider?: DownloadProviderId;
  limit?: number;
}): Promise<DownloadJobRow[]> {
  const jobs = await prisma.downloadJob.findMany({
    where: opts.provider ? { provider: opts.provider as DownloadProvider } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.min(100, Math.max(1, opts.limit ?? 40)),
    include: {
      itens: { select: { status: true } },
    },
  });

  return jobs.map((j) => {
    const itensOk = j.itens.filter((i) => i.status === "concluido").length;
    const itensErro = j.itens.filter((i) => i.status === "erro").length;
    return {
      id: j.id,
      provider: j.provider as DownloadProviderId,
      status: j.status,
      titulo: j.titulo,
      criativoNome: j.criativoNome,
      totalItens: j.totalItens,
      itensFeitos: j.itensFeitos,
      itensOk,
      itensErro,
      erroMsg: j.erroMsg,
      createdAt: j.createdAt.toISOString(),
      finishedAt: j.finishedAt?.toISOString() ?? null,
    };
  });
}

export async function getDownloadJobDetail(id: string) {
  const job = await prisma.downloadJob.findUnique({
    where: { id },
    include: { itens: { orderBy: { createdAt: "asc" } } },
  });
  if (!job) return null;

  return {
    id: job.id,
    provider: job.provider as DownloadProviderId,
    status: job.status,
    titulo: job.titulo,
    criativoNome: job.criativoNome,
    totalItens: job.totalItens,
    itensFeitos: job.itensFeitos,
    erroMsg: job.erroMsg,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    itens: job.itens.map(
      (i): DownloadItemRow => ({
        id: i.id,
        linhaOriginal: i.linhaOriginal,
        inputTipo: i.inputTipo,
        status: i.status,
        arquivoNome: i.arquivoNome,
        titulo: i.titulo,
        artista: i.artista,
        storageKey: i.storageKey,
        sizeBytes: i.sizeBytes,
        erroMsg: i.erroMsg,
        createdAt: i.createdAt.toISOString(),
      }),
    ),
  };
}

export async function listStagingFiles(opts: {
  provider?: DownloadProviderId;
  limit?: number;
}): Promise<StagingFileRow[]> {
  const items = await prisma.downloadItem.findMany({
    where: {
      status: "concluido",
      storageKey: { not: null },
      ...(opts.provider ? { job: { provider: opts.provider as DownloadProvider } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(200, Math.max(1, opts.limit ?? 80)),
    include: {
      job: { select: { provider: true, finishedAt: true } },
    },
  });

  return items.map((i) => ({
    id: i.id,
    jobId: i.jobId,
    provider: i.job.provider as DownloadProviderId,
    arquivoNome: i.arquivoNome,
    titulo: i.titulo,
    artista: i.artista,
    sizeBytes: i.sizeBytes,
    finishedAt: i.job.finishedAt?.toISOString() ?? i.updatedAt.toISOString(),
  }));
}

export async function cancelDownloadJob(id: string): Promise<boolean> {
  const job = await prisma.downloadJob.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!job || job.status === "concluido" || job.status === "cancelado") return false;

  await prisma.$transaction([
    prisma.downloadJob.update({
      where: { id },
      data: { status: "cancelado", finishedAt: new Date() },
    }),
    prisma.downloadItem.updateMany({
      where: { jobId: id, status: { in: ["aguardando", "processando"] } },
      data: { status: "erro", erroMsg: "Cancelado" },
    }),
  ]);
  return true;
}

export async function triggerDownloadProcessing(
  limit = 20,
): Promise<{ triggered: boolean; processed?: number; error?: string }> {
  const { getDownloadServiceConfig } = await import("@/lib/criacao/downloadConfig");
  const cfg = getDownloadServiceConfig();
  const url = cfg.cloud2ProcessUrl;
  if (!url) {
    return {
      triggered: false,
      error: "Configure CRIACAO_CLOUD2_DOWNLOAD_PROCESS_URL no Netlify.",
    };
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.cloud2ProcessSecret) headers.Authorization = `Bearer ${cfg.cloud2ProcessSecret}`;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ limit }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = (await res.json().catch(() => ({}))) as { processed?: number; error?: string };
    if (!res.ok) {
      return {
        triggered: false,
        error: data.error ?? `cloud2 respondeu HTTP ${res.status}`,
      };
    }
    return { triggered: true, processed: data.processed ?? 0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro_rede";
    return { triggered: false, error: msg };
  }
}

export async function refreshDownloadJobCounters(jobId: string) {
  const counts = await prisma.downloadItem.groupBy({
    by: ["status"],
    where: { jobId },
    _count: true,
  });
  const done = counts
    .filter((c) => c.status === "concluido" || c.status === "erro")
    .reduce((s, c) => s + c._count, 0);
  const pending = counts.find((c) => c.status === "aguardando")?._count ?? 0;
  const processing = counts.find((c) => c.status === "processando")?._count ?? 0;
  const errors = counts.find((c) => c.status === "erro")?._count ?? 0;
  const total = done + pending + processing;

  let status: DownloadJobStatus = "processando";
  if (pending === 0 && processing === 0) {
    status = errors === total && total > 0 ? "erro" : "concluido";
  } else if (pending === total) {
    status = "aguardando";
  }

  const job = await prisma.downloadJob.findUnique({
    where: { id: jobId },
    select: { startedAt: true },
  });

  await prisma.downloadJob.update({
    where: { id: jobId },
    data: {
      itensFeitos: done,
      status,
      finishedAt: pending === 0 && processing === 0 ? new Date() : null,
      startedAt: job?.startedAt ?? (processing > 0 || done > 0 ? new Date() : null),
    },
  });
}
