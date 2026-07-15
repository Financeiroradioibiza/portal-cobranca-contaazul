import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { defaultUploadCompetenciaTag } from "@/lib/criacao/uploadCompetenciaTag";
import { applyPendingPastaUploads } from "@/lib/criacao/pastaUploadService";
import { applyPendingPastaEspecialUploads } from "@/lib/criacao/pastaEspecialUploadService";
import { applyPendingUploadTags } from "@/lib/criacao/uploadTagService";
import { cloud2Enabled, cloud2FetchWithTimeout } from "@/lib/criacao/cloud2Client";
import {
  ensureProcessamentoPastaEspecialColumn,
  hasProcessamentoPastaEspecialColumn,
} from "@/lib/criacao/processamentoJobSchemaCompat";

export type UploadArquivo = {
  nome: string;
  sizeBytes?: number;
  downloadItemId?: string;
  /** Servidor UP: ponto de mix do MP3 legado (~N no nome original). */
  mixSegundosFromLegacy?: number;
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
  const jobs: Awaited<ReturnType<typeof createUploadJob>>[] = [];
  for (const lote of lotes) {
    if (!lote.arquivos?.length) continue;
    const job = await createUploadJob({
      ...lote,
      criativoNome: lote.criativoNome ?? defaults.criativoNome,
      criativoUserId: lote.criativoUserId ?? defaults.criativoUserId,
    });
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
    orderBy: { createdAt: "desc" },
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

/** Recalcula status do job quando itens terminam (espelha maybeFinishJob do cloud2). */
export async function tryFinishJob(jobId: string): Promise<{ ok: boolean; status: string }> {
  const job = await prisma.processamentoJob.findUnique({
    where: { id: jobId },
    select: { status: true, tipo: true },
  });
  if (!job) return { ok: false, status: "not_found" };

  const [dupes, pending, erros] = await Promise.all([
    prisma.processamentoItem.count({ where: { jobId, status: "duplicata" } }),
    prisma.processamentoItem.count({
      where: { jobId, status: { in: ["aguardando", "processando"] } },
    }),
    prisma.processamentoItem.count({ where: { jobId, status: "erro" } }),
  ]);

  if (pending > 0) return { ok: false, status: job.status };

  const nextStatus = erros > 0 ? "erro" : dupes > 0 ? "revisao" : "concluido";

  if (job.status !== nextStatus) {
    await prisma.processamentoJob.update({
      where: { id: jobId },
      data: {
        status: nextStatus,
        etapaAtual: "armazenamento",
        finishedAt: nextStatus === "concluido" || nextStatus === "erro" ? new Date() : null,
      },
    });
  }

  if (nextStatus === "concluido") {
    await applyPendingUploadTags(200).catch(() => {});
    await applyPendingPastaUploads(200).catch(() => {});
    if (await hasProcessamentoPastaEspecialColumn()) {
      await applyPendingPastaEspecialUploads(200).catch(() => {});
    }
  }

  return { ok: nextStatus === "concluido", status: nextStatus };
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
  await cloud2FetchWithTimeout(
    "/cleanup/scratch",
    {
      method: "POST",
      body: JSON.stringify({ itemIds }),
    },
    12_000,
  ).catch(() => null);
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
