import type { DownloadProvider, DownloadJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  defaultJobTitulo,
  parseDownloadLines,
  type DownloadProviderId,
} from "@/lib/criacao/downloadParse";
import { expandDeezerDownloadLines, type ExpandedDownloadLine } from "@/lib/criacao/deezerExpand";
import { toCanonicalDeemixUrl } from "@/lib/criacao/deezerCanonical";
import type { DeezerTrackCandidate } from "@/lib/criacao/deezerTrackMatch";
import {
  buildPickErroMsg,
  isPickPendingErroMsg,
  parsePickCandidates,
} from "@/lib/criacao/deezerPickStorage";
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
  erroResumo: string;
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
  needsPick: boolean;
  pickCandidates: DeezerTrackCandidate[];
  createdAt: string;
};

export type StagingFileRow = {
  id: string;
  jobId: string;
  jobTitulo: string;
  provider: DownloadProviderId;
  arquivoNome: string;
  titulo: string;
  artista: string;
  sizeBytes: number | null;
  finishedAt: string | null;
};

export type StagingJobGroup = {
  jobId: string;
  titulo: string;
  provider: DownloadProviderId;
  finishedAt: string | null;
  tracks: StagingFileRow[];
};

/** MP3 real — abaixo disso é lixo HTTP ou download Deemix incompleto. */
export const MIN_VALID_MP3_BYTES = 12_288;

export function isInvalidStagingMp3(sizeBytes: number | null | undefined): boolean {
  return sizeBytes != null && sizeBytes > 0 && sizeBytes < MIN_VALID_MP3_BYTES;
}

export function groupStagingByJob(rows: StagingFileRow[]): StagingJobGroup[] {
  const map = new Map<string, StagingJobGroup>();
  for (const row of rows) {
    let group = map.get(row.jobId);
    if (!group) {
      group = {
        jobId: row.jobId,
        titulo: row.jobTitulo || "Download",
        provider: row.provider,
        finishedAt: row.finishedAt,
        tracks: [],
      };
      map.set(row.jobId, group);
    }
    group.tracks.push(row);
  }
  return Array.from(map.values());
}

export async function createDownloadJob(input: {
  provider: DownloadProviderId;
  titulo?: string;
  linhas: string;
  criativoNome: string;
  criativoUserId?: string;
}) {
  const parsedRaw = parseDownloadLines(input.linhas, input.provider);
  if (parsedRaw.length === 0) {
    throw new Error("nenhuma_linha");
  }

  const parsed: ExpandedDownloadLine[] =
    input.provider === "deemix" ?
      await expandDeezerDownloadLines(parsedRaw)
    : parsedRaw;

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
          status: p.expandError ? ("erro" as DownloadItemStatus) : undefined,
          erroMsg:
            p.expandError ??
            (p.pickCandidates?.length ? buildPickErroMsg(p.pickCandidates) : ""),
        })),
      },
    },
    include: { itens: { select: { id: true } } },
  });

  await refreshDownloadJobCounters(job.id);

  const itensErro = parsed.filter((p) => p.expandError).length;
  const itensPick = parsed.filter((p) => p.pickCandidates?.length).length;

  return { job, itensErro, itensPick };
}

/** Acrescenta faixas a um job Deemix existente (Servidor UP em lotes). */
export async function appendDownloadJobItems(input: { jobId: string; linhas: string }) {
  const job = await prisma.downloadJob.findUnique({
    where: { id: input.jobId },
    select: { id: true, provider: true, status: true, totalItens: true },
  });
  if (!job) throw new Error("job_not_found");
  if (job.status === "cancelado") throw new Error("job_fechado");

  const provider = job.provider as DownloadProviderId;
  const parsedRaw = parseDownloadLines(input.linhas, provider);
  if (parsedRaw.length === 0) throw new Error("nenhuma_linha");

  const parsed: ExpandedDownloadLine[] =
    provider === "deemix" ?
      await expandDeezerDownloadLines(parsedRaw)
    : parsedRaw;
  if (parsed.length === 0) throw new Error("nenhuma_linha");

  await prisma.downloadItem.createMany({
    data: parsed.map((p) => ({
      jobId: job.id,
      linhaOriginal: p.linhaOriginal.slice(0, 4000),
      inputTipo: p.inputTipo,
      status: p.expandError ? ("erro" as DownloadItemStatus) : undefined,
      erroMsg:
        p.expandError ??
        (p.pickCandidates?.length ? buildPickErroMsg(p.pickCandidates) : ""),
    })),
  });

  await prisma.downloadJob.update({
    where: { id: job.id },
    data: { totalItens: job.totalItens + parsed.length },
  });
  await refreshDownloadJobCounters(job.id);

  const updated = await prisma.downloadJob.findUnique({ where: { id: job.id } });
  if (!updated) throw new Error("job_not_found");

  return {
    job: updated,
    added: parsed.length,
    itensErro: parsed.filter((p) => p.expandError).length,
    itensPick: parsed.filter((p) => p.pickCandidates?.length).length,
  };
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
      itens: { select: { status: true, erroMsg: true } },
    },
  });

  return jobs.map((j) => {
    const itensOk = j.itens.filter((i) => i.status === "concluido").length;
    const itensErro = j.itens.filter((i) => i.status === "erro").length;
    const firstItemErro = j.itens.find((i) => i.status === "erro" && i.erroMsg.trim())?.erroMsg ?? "";
    const erroResumo = (j.erroMsg || firstItemErro).trim();
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
      erroResumo,
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
    itens: job.itens.map((i): DownloadItemRow => {
      const pickCandidates = parsePickCandidates(i.erroMsg) ?? [];
      return {
        id: i.id,
        linhaOriginal: i.linhaOriginal,
        inputTipo: i.inputTipo,
        status: i.status,
        arquivoNome: i.arquivoNome,
        titulo: i.titulo,
        artista: i.artista,
        storageKey: i.storageKey,
        sizeBytes: i.sizeBytes,
        erroMsg: isPickPendingErroMsg(i.erroMsg) ? "" : i.erroMsg,
        needsPick: pickCandidates.length > 0 && i.status === "aguardando",
        pickCandidates,
        createdAt: i.createdAt.toISOString(),
      };
    }),
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
      NOT: { providerRef: { startsWith: "import:" } },
      ...(opts.provider ? { job: { provider: opts.provider as DownloadProvider } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(200, Math.max(1, opts.limit ?? 80)),
    include: {
      job: { select: { provider: true, titulo: true, finishedAt: true } },
    },
  });

  return items.map((i) => ({
    id: i.id,
    jobId: i.jobId,
    jobTitulo: i.job.titulo,
    provider: i.job.provider as DownloadProviderId,
    arquivoNome: i.arquivoNome,
    titulo: i.titulo,
    artista: i.artista,
    sizeBytes: i.sizeBytes,
    finishedAt: i.job.finishedAt?.toISOString() ?? i.updatedAt.toISOString(),
  }));
}

export async function confirmDownloadItemPick(itemId: string, trackUrl: string): Promise<string> {
  const item = await prisma.downloadItem.findUnique({
    where: { id: itemId },
    select: { id: true, jobId: true, erroMsg: true, status: true },
  });
  if (!item) throw new Error("not_found");

  const candidates = parsePickCandidates(item.erroMsg);
  if (!candidates?.length) throw new Error("nao_precisa_escolha");
  if (item.status !== "aguardando") throw new Error("item_nao_aguardando");

  const trimmed = trackUrl.trim();
  const canonical = toCanonicalDeemixUrl(trimmed);
  let resolvedUrl = canonical?.kind === "track" ? canonical.url : null;
  if (!resolvedUrl) {
    const byCandidate = candidates.find(
      (c) => c.url === trimmed || String(c.trackId) === trimmed.replace(/\D/g, ""),
    );
    if (byCandidate) resolvedUrl = byCandidate.url;
  }
  if (!resolvedUrl) throw new Error("url_invalida");

  await prisma.downloadItem.update({
    where: { id: itemId },
    data: {
      linhaOriginal: resolvedUrl,
      inputTipo: "url",
      erroMsg: "",
      status: "aguardando",
    },
  });

  await refreshDownloadJobCounters(item.jobId);
  return item.jobId;
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
  opts?: { timeoutMs?: number },
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
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 120_000),
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

export async function getDownloadDiagnostics(): Promise<{
  cloud2Configured: boolean;
  cloud2Health: Record<string, unknown> | null;
  cloud2Error: string | null;
  providers: Record<DownloadProviderId, boolean>;
}> {
  const { getDownloadServiceConfig, providerConfigured } = await import("@/lib/criacao/downloadConfig");
  const cfg = getDownloadServiceConfig();
  const providers = {
    spotizerr: providerConfigured("spotizerr", cfg),
    deemix: providerConfigured("deemix", cfg),
    youtube: providerConfigured("youtube", cfg),
  } as Record<DownloadProviderId, boolean>;

  if (!cfg.cloud2ProcessUrl) {
    return {
      cloud2Configured: false,
      cloud2Health: null,
      cloud2Error: "CRIACAO_CLOUD2_DOWNLOAD_PROCESS_URL não configurado no Netlify.",
      providers,
    };
  }

  const healthUrl = cfg.cloud2ProcessUrl.replace(/\/download\/process\/?$/, "/download/health");
  try {
    const headers: Record<string, string> = {};
    if (cfg.cloud2ProcessSecret) headers.Authorization = `Bearer ${cfg.cloud2ProcessSecret}`;
    const res = await fetch(healthUrl, { headers, signal: AbortSignal.timeout(12_000) });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      return {
        cloud2Configured: true,
        cloud2Health: data,
        cloud2Error: `cloud2 health HTTP ${res.status}`,
        providers,
      };
    }
    return { cloud2Configured: true, cloud2Health: data, cloud2Error: null, providers };
  } catch (e) {
    return {
      cloud2Configured: true,
      cloud2Health: null,
      cloud2Error: e instanceof Error ? e.message : "erro_rede",
      providers,
    };
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

/** Itens marcados concluídos sem arquivo no staging (ex.: cleanup antigo) — voltam para a fila Deemix. */
export async function requeueDownloadItemsMissingStorage(jobId: string): Promise<{
  requeued: number;
  stillReady: number;
}> {
  const id = jobId.trim();
  if (!id) return { requeued: 0, stillReady: 0 };

  const requeued = await prisma.downloadItem.updateMany({
    where: {
      jobId: id,
      status: "concluido",
      OR: [{ storageKey: null }, { storageKey: "" }],
    },
    data: {
      status: "aguardando",
      erroMsg: "",
      storageKey: null,
      sizeBytes: null,
    },
  });

  if (requeued.count > 0) {
    await prisma.downloadJob.update({
      where: { id },
      data: { status: "processando", finishedAt: null },
    });
  }
  await refreshDownloadJobCounters(id);

  const stillReady = await prisma.downloadItem.count({
    where: {
      jobId: id,
      status: "concluido",
      storageKey: { not: null },
      NOT: { storageKey: "" },
    },
  });

  return { requeued: requeued.count, stillReady };
}

export async function countDownloadStagingReady(jobId: string): Promise<number> {
  return prisma.downloadItem.count({
    where: {
      jobId: jobId.trim(),
      status: "concluido",
      storageKey: { not: null },
      NOT: { storageKey: "" },
    },
  });
}

export async function triggerRestoreDownloadStaging(
  jobId: string,
): Promise<{ restored: number; scanned: number; error?: string }> {
  const { getDownloadServiceConfig } = await import("@/lib/criacao/downloadConfig");
  const cfg = getDownloadServiceConfig();
  const processUrl = cfg.cloud2ProcessUrl;
  if (!processUrl) {
    return { restored: 0, scanned: 0, error: "Configure CRIACAO_CLOUD2_DOWNLOAD_PROCESS_URL no Netlify." };
  }
  const restoreUrl = processUrl.replace(/\/download\/process\/?$/i, "/download/restore-staging");
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.cloud2ProcessSecret) headers.Authorization = `Bearer ${cfg.cloud2ProcessSecret}`;
    const res = await fetch(restoreUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ jobId: jobId.trim(), limit: 450 }),
      signal: AbortSignal.timeout(22_000),
    });
    const text = await res.text();
    let data: { ok?: boolean; restored?: number; scanned?: number; error?: string };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      return {
        restored: 0,
        scanned: 0,
        error: res.ok ? "Resposta inválida do cloud2." : `cloud2 HTTP ${res.status} — faça deploy do patch no servidor.`,
      };
    }
    if (!res.ok || !data.ok) {
      return { restored: 0, scanned: data.scanned ?? 0, error: data.error ?? `cloud2 HTTP ${res.status}` };
    }
    return { restored: data.restored ?? 0, scanned: data.scanned ?? 0 };
  } catch (e) {
    return { restored: 0, scanned: 0, error: e instanceof Error ? e.message : "erro_rede" };
  }
}
