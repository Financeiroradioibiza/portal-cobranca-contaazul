import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type UploadArquivo = { nome: string; sizeBytes?: number };

export type CreateUploadJobInput = {
  titulo: string;
  clienteRef?: string;
  clienteNome?: string;
  criativoNome?: string;
  criativoUserId?: string;
  uploadTagNome?: string;
  programacaoId?: string;
  pastaId?: string;
  arquivos: UploadArquivo[];
};

/** Um lote = um job na fila (uma pasta ou tag de biblioteca). */
export type UploadLoteInput = CreateUploadJobInput & {
  /** pasta = programação do cliente; biblioteca = só tag no acervo */
  destinoTipo?: "pasta" | "biblioteca";
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
  const arquivos = (input.arquivos ?? []).filter((a) => a?.nome?.trim());

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
      uploadTagNome: (input.uploadTagNome ?? "").trim().slice(0, 80),
      programacaoId: input.programacaoId || null,
      pastaId: input.pastaId || null,
      totalItens: arquivos.length,
      itensFeitos: 0,
      itens: {
        create: arquivos.map((a) => ({
          arquivoNome: a.nome.slice(0, 500),
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
    include: {
      itens: { select: { status: true } },
    },
  });

  return jobs.map((j) => {
    const duplicatas = j.itens.filter((i) => i.status === "duplicata").length;
    const erros = j.itens.filter((i) => i.status === "erro").length;
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
  if (job.pastaId) {
    const pasta = await prisma.pasta.findUnique({
      where: { id: job.pastaId },
      select: { nome: true, programacao: { select: { nome: true } } },
    });
    pastaNome = pasta?.nome ?? "";
    programacaoNome = pasta?.programacao?.nome ?? "";
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
    pastaNome,
    programacaoNome,
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

/** Aprova lote após revisão humana — libera tag na biblioteca e faixas na pasta. */
export async function approveJob(id: string): Promise<{ ok: boolean; reason?: string }> {
  const job = await prisma.processamentoJob.findUnique({
    where: { id },
    select: { status: true, tipo: true },
  });
  if (!job) return { ok: false, reason: "not_found" };
  if (job.status !== "revisao") return { ok: false, reason: "not_in_revisao" };

  const dupes = await prisma.processamentoItem.count({
    where: { jobId: id, status: "duplicata" },
  });
  if (dupes > 0) return { ok: false, reason: "duplicatas_pendentes" };

  const pendentes = await prisma.processamentoItem.count({
    where: { jobId: id, status: { in: ["aguardando", "processando"] } },
  });
  if (pendentes > 0) return { ok: false, reason: "processamento_pendente" };

  await prisma.processamentoJob.update({
    where: { id },
    data: { status: "concluido", finishedAt: new Date(), etapaAtual: "armazenamento" },
  });
  return { ok: true };
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
    },
  });
  return true;
}

export { ETAPAS };
