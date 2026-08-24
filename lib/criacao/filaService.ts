import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { defaultUploadCompetenciaTag } from "@/lib/criacao/uploadCompetenciaTag";
import {
  applyAllPendingPastaUploads,
  applyPendingPastaUploadsForJob,
} from "@/lib/criacao/pastaUploadService";
import { applyPendingPastaEspecialUploads } from "@/lib/criacao/pastaEspecialUploadService";
import {
  applyAllPendingUploadTags,
  applyPendingUploadTagsForJob,
} from "@/lib/criacao/uploadTagService";
import { cloud2Enabled, cloud2FetchWithTimeout } from "@/lib/criacao/cloud2Client";
import {
  ensureProcessamentoPastaEspecialColumn,
  hasProcessamentoPastaEspecialColumn,
} from "@/lib/criacao/processamentoJobSchemaCompat";
import { allocateFilaOrdemForBatch, allocateNextFilaOrdem } from "@/lib/criacao/filaOrdemService";
import { CRIACAO_INGEST_URL, signTicket } from "@/lib/criacao/ingestTicket";

export { recoverStagingForJob, recoverStagingForPendingItems, recoverStagingForActiveUploadJobs } from "@/lib/criacao/stagingRecoverService";

export type UploadArquivo = {
  nome: string;
  sizeBytes?: number;
  downloadItemId?: string;
};

export type CreateUploadJobInput = {
  titulo: string;
  clienteRef?: string;
  clienteNome?: string;
  criativoNome?: string;
  criativoUserId?: string;
  uploadTagNome?: string;
  programacaoId?: string;
  pastaId?: string;
  pastaEspecialId?: string;
  arquivos: UploadArquivo[];
  /** Reservado para batch; senão aloca automaticamente. */
  filaOrdem?: number;
};

/** Um lote = um job na fila (pasta de programação, pasta especial ou tag de biblioteca). */
export type UploadLoteInput = CreateUploadJobInput & {
  /** pasta = programação do cliente; pasta_especial = coringa global; biblioteca = só tag no acervo */
  destinoTipo?: "pasta" | "biblioteca" | "pasta_especial";
};

const ETAPAS = ["upload", "deduplicacao", "ponto_mix", "normalizacao", "tags", "armazenamento"] as const;
export const ETAPA_LABEL: Record<string, string> = {
  upload: "Upload",
  deduplicacao: "Deduplicação",
  ponto_mix: "Ponto de mix",
  normalizacao: "Normalização LUFS",
  tags: "Tags",
  armazenamento: "Armazenamento",
};

export async function createUploadJob(input: CreateUploadJobInput) {
  const titulo = (input.titulo || "").trim() || "Upload sem título";
  const arquivos = (input.arquivos ?? []).filter((a) => a?.nome?.trim() || a?.downloadItemId);
  if (arquivos.length === 0) {
    throw new Error("nenhum_arquivo");
  }

  if (!(await ensureProcessamentoPastaEspecialColumn())) {
    throw new Error("pasta_especial_migration_pendente");
  }

  const pastaEspecialId = input.pastaEspecialId?.trim();
  const filaOrdem = input.filaOrdem ?? (await allocateNextFilaOrdem());

  const job = await prisma.processamentoJob.create({
    data: {
      tipo: "upload_pasta",
      status: "aguardando",
      etapaAtual: "upload",
      titulo: titulo.slice(0, 200),
      clienteRef: input.clienteRef?.slice(0, 120) || null,
      clienteNome: (input.clienteNome ?? "").slice(0, 200),
      criativoNome: (input.criativoNome ?? "").slice(0, 120),
      criativoUserId: input.criativoUserId?.slice(0, 200) || null,
      uploadTagNome: ((input.uploadTagNome ?? "").trim() || defaultUploadCompetenciaTag()).slice(0, 80),
      programacaoId: input.programacaoId || null,
      pastaId: input.pastaId || null,
      ...(pastaEspecialId ? { pastaEspecialId } : {}),
      filaOrdem,
      totalItens: arquivos.length,
      itensFeitos: 0,
      itens: {
        create: arquivos.map((a) => ({
          arquivoNome: (a.nome?.trim() || "faixa.mp3").slice(0, 500),
          status: "aguardando" as const,
        })),
      },
    },
    include: { itens: { select: { id: true, arquivoNome: true }, orderBy: { createdAt: "asc" } } },
  });

  return job;
}

/** Cria vários jobs de upload em um único disparo (multi-pasta / multi-cliente). */
export async function createUploadJobsBatch(
  lotes: UploadLoteInput[],
  defaults: { criativoNome?: string; criativoUserId?: string },
) {
  const valid = lotes.filter((l) => (l.arquivos?.length ?? 0) > 0);
  const ordens = await allocateFilaOrdemForBatch(valid.length);
  const jobs: Awaited<ReturnType<typeof createUploadJob>>[] = [];
  let ordemIdx = 0;
  for (const lote of lotes) {
    if (!lote.arquivos?.length) continue;
    const job = await createUploadJob({
      ...lote,
      criativoNome: lote.criativoNome ?? defaults.criativoNome,
      criativoUserId: lote.criativoUserId ?? defaults.criativoUserId,
      filaOrdem: ordens[ordemIdx],
    });
    ordemIdx += 1;
    jobs.push(job);
  }
  return jobs;
}

export type JobListRow = {
  id: string;
  tipo: string;
  status: string;
  etapaAtual: string;
  titulo: string;
  clienteNome: string;
  criativoNome: string;
  totalItens: number;
  itensFeitos: number;
  duplicatas: number;
  erros: number;
  erroMsg: string;
  filaOrdem: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export async function listJobs(opts: { status?: string; limit?: number }): Promise<JobListRow[]> {
  const where: Prisma.ProcessamentoJobWhereInput = {};
  if (opts.status && opts.status !== "all") {
    where.status = opts.status as Prisma.ProcessamentoJobWhereInput["status"];
  }

  const jobs = await prisma.processamentoJob.findMany({
    where,
    orderBy: [{ filaOrdem: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: Math.min(200, Math.max(1, opts.limit ?? 100)),
    select: {
      id: true,
      tipo: true,
      status: true,
      etapaAtual: true,
      titulo: true,
      clienteNome: true,
      criativoNome: true,
      totalItens: true,
      itensFeitos: true,
      erroMsg: true,
      filaOrdem: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
    },
  });

  if (jobs.length === 0) return [];

  const jobIds = jobs.map((j) => j.id);
  const itemCounts = await prisma.processamentoItem.groupBy({
    by: ["jobId", "status"],
    where: { jobId: { in: jobIds } },
    _count: { _all: true },
  });

  const dupeMap = new Map<string, number>();
  const erroMap = new Map<string, number>();
  for (const row of itemCounts) {
    const n = row._count._all;
    if (row.status === "duplicata") dupeMap.set(row.jobId, (dupeMap.get(row.jobId) ?? 0) + n);
    if (row.status === "erro") erroMap.set(row.jobId, (erroMap.get(row.jobId) ?? 0) + n);
  }

  return jobs.map((j) => {
    const duplicatas = dupeMap.get(j.id) ?? 0;
    const erros = erroMap.get(j.id) ?? 0;
    return {
      id: j.id,
      tipo: j.tipo,
      status: j.status,
      etapaAtual: j.etapaAtual,
      titulo: j.titulo,
      clienteNome: j.clienteNome,
      criativoNome: j.criativoNome,
      totalItens: j.totalItens,
      itensFeitos: j.itensFeitos,
      duplicatas,
      erros,
      erroMsg: j.erroMsg,
      filaOrdem: j.filaOrdem,
      createdAt: j.createdAt.toISOString(),
      startedAt: j.startedAt?.toISOString() ?? null,
      finishedAt: j.finishedAt?.toISOString() ?? null,
    };
  });
}

export async function getJobDetail(id: string) {
  const job = await prisma.processamentoJob.findUnique({
    where: { id },
    include: {
      itens: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!job) return null;

  let pastaNome = "";
  let programacaoNome = "";
  let pastaEspecialNome = "";
  if (job.pastaId) {
    const pasta = await prisma.pasta.findUnique({
      where: { id: job.pastaId },
      select: { nome: true, programacao: { select: { nome: true } } },
    });
    pastaNome = pasta?.nome ?? "";
    programacaoNome = pasta?.programacao?.nome ?? "";
  }
  if (job.pastaEspecialId && (await hasProcessamentoPastaEspecialColumn())) {
    const especial = await prisma.pastaEspecial.findUnique({
      where: { id: job.pastaEspecialId },
      select: { nome: true },
    });
    pastaEspecialNome = especial?.nome ?? "";
  }

  return {
    id: job.id,
    tipo: job.tipo,
    status: job.status,
    etapaAtual: job.etapaAtual,
    titulo: job.titulo,
    clienteRef: job.clienteRef,
    clienteNome: job.clienteNome,
    criativoNome: job.criativoNome,
    uploadTagNome: job.uploadTagNome,
    programacaoId: job.programacaoId,
    pastaId: job.pastaId,
    pastaEspecialId: job.pastaEspecialId,
    pastaNome,
    programacaoNome,
    pastaEspecialNome,
    totalItens: job.totalItens,
    itensFeitos: job.itensFeitos,
    erroMsg: job.erroMsg,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    itens: job.itens.map((i) => ({
      id: i.id,
      arquivoNome: i.arquivoNome,
      status: i.status,
      etapaAtual: i.etapaAtual,
      musicaId: i.musicaId,
      duplicataDeId: i.duplicataDeId,
      erroMsg: i.erroMsg,
    })),
  };
}

export async function cancelJob(id: string): Promise<boolean> {
  const job = await prisma.processamentoJob.findUnique({ where: { id }, select: { status: true } });
  if (!job) return false;
  if (job.status === "concluido" || job.status === "cancelado") return false;
  await prisma.processamentoJob.update({
    where: { id },
    data: { status: "cancelado", finishedAt: new Date() },
  });
  return true;
}

/** Job terminou: tag + pasta desse job (sem limite global de 20/200). */
async function applyPostFinishForJob(jobId: string): Promise<void> {
  await applyPendingUploadTagsForJob(jobId).catch(() => {});
  await applyPendingPastaUploadsForJob(jobId).catch(() => {});
}

/** Job terminou: aplica tag + pasta quando há faixas ok (sync global). */
async function applyPostFinishSideEffects(): Promise<void> {
  await applyAllPendingUploadTags().catch(() => {});
  await applyAllPendingPastaUploads().catch(() => {});
  if (await hasProcessamentoPastaEspecialColumn()) {
    await applyPendingPastaEspecialUploads(200).catch(() => {});
  }
}

/**
 * Status final do job quando não há itens pendentes.
 * Erros parciais → concluido (faixas ok vão para biblioteca/pasta); só `erro` se todas falharam.
 */
export function computeFinishedJobStatus(counts: {
  pending: number;
  dupes: number;
  erros: number;
  concluidos: number;
}): "processando" | "revisao" | "concluido" | "erro" {
  if (counts.pending > 0) return "processando";
  if (counts.dupes > 0) return "revisao";
  if (counts.concluidos > 0) return "concluido";
  if (counts.erros > 0) return "erro";
  return "concluido";
}

const UPLOAD_NAO_CONCLUIDO = "upload_nao_concluido";

/**
 * Faixas que nunca receberam MP3 (upload falhou ou browser fechou) não devem
 * bloquear o lote quando o restante já terminou — marca como erro terminal.
 * Grace: browser pode levar minutos enviando lote grande; nunca cancelar cedo.
 */
export async function releaseMissingUploadItemsForJob(jobId: string): Promise<number> {
  const pendingNoUpload = await prisma.processamentoItem.count({
    where: { jobId, status: "aguardando", rawStorageKey: null },
  });
  if (pendingNoUpload === 0) return 0;

  const pendingReal = await prisma.processamentoItem.count({
    where: {
      jobId,
      OR: [{ status: "processando" }, { status: "aguardando", rawStorageKey: { not: null } }],
    },
  });
  if (pendingReal > 0) return 0;

  const job = await prisma.processamentoJob.findUnique({
    where: { id: jobId },
    select: { createdAt: true, tipo: true },
  });
  if (job?.tipo === "upload_pasta") {
    const graceMs = Math.min(90 * 60 * 1000, Math.max(20 * 60 * 1000, pendingNoUpload * 8_000));
    if (Date.now() - job.createdAt.getTime() < graceMs) return 0;
  }

  const cutoff = new Date(Date.now() - 20 * 60 * 1000);
  const r = await prisma.processamentoItem.updateMany({
    where: { jobId, status: "aguardando", rawStorageKey: null, updatedAt: { lt: cutoff } },
    data: { status: "erro", etapaAtual: "upload", erroMsg: UPLOAD_NAO_CONCLUIDO },
  });
  return r.count;
}

/** Reabre faixas com upload_nao_concluido e devolve tickets para reenvio pelo browser. */
export async function retryUploadFailuresForJob(jobId: string): Promise<{
  reset: number;
  ingestUrl: string;
  tickets: Array<{ itemId: string; arquivoNome: string; token: string; exp: number }>;
}> {
  const failed = await prisma.processamentoItem.findMany({
    where: { jobId, status: "erro", erroMsg: UPLOAD_NAO_CONCLUIDO },
    select: { id: true, arquivoNome: true },
    orderBy: { id: "asc" },
  });
  if (failed.length === 0) {
    return { reset: 0, ingestUrl: CRIACAO_INGEST_URL, tickets: [] };
  }

  await prisma.processamentoItem.updateMany({
    where: { id: { in: failed.map((f) => f.id) } },
    data: { status: "aguardando", erroMsg: "", etapaAtual: "upload", updatedAt: new Date() },
  });
  await prisma.processamentoJob.update({
    where: { id: jobId },
    data: { status: "aguardando", finishedAt: null, etapaAtual: "upload", erroMsg: "" },
  });

  const tickets = failed.map((it) => {
    const { token, exp } = signTicket(it.id, jobId);
    return { itemId: it.id, arquivoNome: it.arquivoNome, token, exp };
  });
  return { reset: failed.length, ingestUrl: CRIACAO_INGEST_URL, tickets };
}

/** Varre jobs processando cujo único bloqueio são uploads ausentes. */
export async function releaseBlockedJobsWithMissingUploads(limit = 40): Promise<number> {
  const jobs = await prisma.processamentoJob.findMany({
    where: { status: { in: ["processando", "aguardando"] } },
    select: { id: true },
    take: limit,
    orderBy: { updatedAt: "asc" },
  });
  let n = 0;
  for (const j of jobs) {
    const released = await releaseMissingUploadItemsForJob(j.id);
    if (released === 0) continue;
    const r = await tryFinishJob(j.id);
    if (r.status === "concluido" || r.status === "erro" || r.status === "revisao") n += 1;
  }
  return n;
}

/** Recalcula status do job quando itens terminam (espelha maybeFinishJob do cloud2). */
export async function tryFinishJob(jobId: string): Promise<{ ok: boolean; status: string }> {
  const job = await prisma.processamentoJob.findUnique({
    where: { id: jobId },
    select: { status: true, tipo: true },
  });
  if (!job) return { ok: false, status: "not_found" };

  await releaseMissingUploadItemsForJob(jobId);

  const [dupes, pending, erros, concluidos] = await Promise.all([
    prisma.processamentoItem.count({ where: { jobId, status: "duplicata" } }),
    prisma.processamentoItem.count({
      where: { jobId, status: { in: ["aguardando", "processando"] } },
    }),
    prisma.processamentoItem.count({ where: { jobId, status: "erro" } }),
    prisma.processamentoItem.count({ where: { jobId, status: "concluido" } }),
  ]);

  if (pending > 0) return { ok: false, status: job.status };

  const nextStatus = computeFinishedJobStatus({ pending, dupes, erros, concluidos });
  const terminal = nextStatus === "concluido" || nextStatus === "erro";

  if (job.status !== nextStatus) {
    await prisma.processamentoJob.update({
      where: { id: jobId },
      data: {
        status: nextStatus,
        etapaAtual: "armazenamento",
        finishedAt: terminal ? new Date() : null,
      },
    });
  }

  if (nextStatus === "concluido" && concluidos > 0) {
    await applyPostFinishForJob(jobId);
  } else if (concluidos > 0 && pending === 0) {
    /** Erros/duplicatas pendentes — faixas ok ainda vão para a pasta. */
    await applyPostFinishForJob(jobId).catch(() => {});
  }

  return { ok: nextStatus === "concluido", status: nextStatus };
}

/**
 * Jobs marcados `erro` só por falhas parciais — reabre como concluido e aplica pasta/tag.
 * Recupera lotes ATL CRICA já processados (ex.: Farm 244/247).
 */
export async function reconcilePartialErroredJobs(limit = 40): Promise<number> {
  const jobs = await prisma.processamentoJob.findMany({
    where: { status: "erro" },
    select: { id: true },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });
  let n = 0;
  for (const j of jobs) {
    const [pending, dupes, concluidos] = await Promise.all([
      prisma.processamentoItem.count({
        where: { jobId: j.id, status: { in: ["aguardando", "processando"] } },
      }),
      prisma.processamentoItem.count({ where: { jobId: j.id, status: "duplicata" } }),
      prisma.processamentoItem.count({ where: { jobId: j.id, status: "concluido" } }),
    ]);
    if (pending > 0 || dupes > 0 || concluidos === 0) continue;
    await prisma.processamentoJob.update({
      where: { id: j.id },
      data: { status: "concluido", etapaAtual: "armazenamento", finishedAt: new Date() },
    });
    await applyPostFinishForJob(j.id).catch(() => {});
    n += 1;
  }
  return n;
}

/**
 * Jobs já `concluido` mas com faixas ainda fora da pasta — recupera ATL CRICA parcial.
 */
export async function reconcileUnappliedPastaJobs(jobLimit = 50): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ jobId: string }>>`
    SELECT DISTINCT j.id AS "jobId"
      FROM processamento_job j
      JOIN processamento_item pi ON pi.job_id = j.id
     WHERE j.pasta_id IS NOT NULL
       AND pi.status = 'concluido'
       AND pi.musica_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM processamento_item pi2
          WHERE pi2.job_id = j.id
            AND pi2.status IN ('aguardando', 'processando')
       )
       AND NOT EXISTS (
         SELECT 1 FROM pasta_musica pm
          WHERE pm.pasta_id = j.pasta_id
            AND pm.musica_id = pi.musica_id
       )
     ORDER BY j.updated_at DESC
     LIMIT ${Math.min(100, Math.max(1, jobLimit))}
  `;

  let applied = 0;
  for (const { jobId } of rows) {
    await tryFinishJob(jobId).catch(() => {});
    await applyPendingUploadTagsForJob(jobId).catch(() => {});
    applied += await applyPendingPastaUploadsForJob(jobId).catch(() => 0);
  }
  return applied;
}

/** Varre todos os jobs com faixas pendentes na pasta (várias rodadas). */
export async function reconcileAllUnappliedPastaJobs(): Promise<number> {
  let total = 0;
  for (let round = 0; round < 15; round += 1) {
    const n = await reconcileUnappliedPastaJobs(60);
    total += n;
    if (n === 0) break;
  }
  return total;
}

/** Reaplica pasta + tag de um job (botão manual na fila). */
export async function applyJobPastaAndTags(jobId: string): Promise<{ tags: number; pastas: number }> {
  await tryFinishJob(jobId).catch(() => {});
  const tags = await applyPendingUploadTagsForJob(jobId).catch(() => 0);
  const pastas = await applyPendingPastaUploadsForJob(jobId).catch(() => 0);
  return { tags, pastas };
}

/** Jobs em revisão sem duplicatas pendentes → concluído automaticamente. */
export async function autoFinishJobsReady(): Promise<number> {
  const jobs = await prisma.processamentoJob.findMany({
    where: { status: "revisao" },
    select: { id: true },
    take: 50,
  });
  let finished = 0;
  for (const j of jobs) {
    const dupes = await prisma.processamentoItem.count({
      where: { jobId: j.id, status: "duplicata" },
    });
    if (dupes > 0) continue;
    const r = await tryFinishJob(j.id);
    if (r.status === "concluido") finished += 1;
  }
  return finished;
}

/** Jobs com barra cheia mas status ainda processando/aguardando/erro — fecha e aplica tag/pasta. */
export async function reconcileStuckProcessingJobs(): Promise<number> {
  const jobs = await prisma.processamentoJob.findMany({
    where: { status: { in: ["processando", "aguardando", "erro"] } },
    select: { id: true },
    take: 60,
    orderBy: { updatedAt: "asc" },
  });
  let n = 0;
  for (const j of jobs) {
    await releaseMissingUploadItemsForJob(j.id);
    const pending = await prisma.processamentoItem.count({
      where: { jobId: j.id, status: { in: ["aguardando", "processando"] } },
    });
    if (pending > 0) continue;
    const r = await tryFinishJob(j.id);
    if (r.status === "concluido" || r.status === "revisao" || r.status === "erro") n += 1;
  }
  return n;
}

/** Faixa presa em processando (worker caiu) — volta para aguardando. */
export async function resetStaleProcessingItems(maxAgeMinutes = 12): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  const r = await prisma.processamentoItem.updateMany({
    where: { status: "processando", updatedAt: { lt: cutoff } },
    data: { status: "aguardando", etapaAtual: "deduplicacao", erroMsg: "" },
  });
  return r.count;
}

/** Aprova lote após revisão humana — libera tag na biblioteca e faixas na pasta. */
export async function approveJob(id: string): Promise<{ ok: boolean; reason?: string }> {
  const result = await tryFinishJob(id);
  if (result.status === "concluido") return { ok: true };
  if (result.status === "revisao") {
    const dupes = await prisma.processamentoItem.count({
      where: { jobId: id, status: "duplicata" },
    });
    if (dupes > 0) return { ok: false, reason: "duplicatas_pendentes" };
  }
  if (result.status === "processando" || result.status === "aguardando") {
    return { ok: false, reason: "processamento_pendente" };
  }
  return { ok: false, reason: "not_in_revisao" };
}

/** Remove upload/work no cloud2 após item terminalizado (duplicata descartada, etc.). */
async function cloud2CleanupScratch(itemIds: string[]): Promise<void> {
  if (!cloud2Enabled() || itemIds.length === 0) return;
  const BATCH = 25;
  for (let i = 0; i < itemIds.length; i += BATCH) {
    await cloud2FetchWithTimeout(
      "/cleanup/scratch",
      {
        method: "POST",
        body: JSON.stringify({ itemIds: itemIds.slice(i, i + BATCH) }),
      },
      12_000,
    ).catch(() => null);
  }
}

/** Resolução manual de duplicata: "nova" mantém como faixa nova; "existente" descarta o item. */
export async function resolveDuplicata(itemId: string, decision: "nova" | "existente"): Promise<boolean> {
  const item = await prisma.processamentoItem.findUnique({
    where: { id: itemId },
    select: { id: true, status: true, jobId: true },
  });
  if (!item || item.status !== "duplicata") return false;

  await prisma.processamentoItem.update({
    where: { id: itemId },
    data: {
      status: decision === "nova" ? "aguardando" : "concluido",
      erroMsg: decision === "existente" ? "Descartada (duplicata confirmada)" : "",
      ...(decision === "nova" ? { musicaId: null } : {}),
    },
  });
  if (decision === "existente") {
    await cloud2CleanupScratch([itemId]);
    await tryFinishJob(item.jobId).catch(() => {});
  }
  return true;
}

/** Resolve todas as duplicatas pendentes de um job de uma vez. */
export async function resolveDuplicatasBulk(
  jobId: string,
  decision: "nova" | "existente",
): Promise<number> {
  const dupes =
    decision === "existente" ?
      await prisma.processamentoItem.findMany({
        where: { jobId, status: "duplicata" },
        select: { id: true },
      })
    : [];
  const result = await prisma.processamentoItem.updateMany({
    where: { jobId, status: "duplicata" },
    data: {
      status: decision === "nova" ? "aguardando" : "concluido",
      erroMsg: decision === "existente" ? "Descartada (duplicata confirmada)" : "",
    },
  });
  if (decision === "existente") {
    await cloud2CleanupScratch(dupes.map((d) => d.id));
    await tryFinishJob(jobId).catch(() => {});
  }
  return result.count;
}

export { ETAPAS };
