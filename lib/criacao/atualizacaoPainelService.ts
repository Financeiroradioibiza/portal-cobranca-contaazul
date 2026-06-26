import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { competenciaFromDate } from "@/lib/criacao/competencia";
import { hasAtualizacaoPainelTable } from "@/lib/criacao/atualizacaoPainelSchemaCompat";

export type FechamentoPainelItem = {
  rotulo: string;
  tipo: "install" | "atl" | "especial";
  em: string;
  atualizacaoId: string;
};

export type PainelRow = {
  programacaoId: string;
  programacaoNome: string;
  clienteRef: string;
  clienteNome: string;
  criativoEntregue: boolean;
  criativoEntregueEm: string | null;
  criativoEntreguePor: string;
  subidaFila: boolean;
  subidaFilaEm: string | null;
  subidaFilaPor: string;
  fechamentos: FechamentoPainelItem[];
};

function parseFechamentos(raw: Prisma.JsonValue): FechamentoPainelItem[] {
  if (!Array.isArray(raw)) return [];
  const out: FechamentoPainelItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const tipo = o.tipo;
    if (tipo !== "install" && tipo !== "atl" && tipo !== "especial") continue;
    out.push({
      rotulo: String(o.rotulo ?? ""),
      tipo,
      em: String(o.em ?? ""),
      atualizacaoId: String(o.atualizacaoId ?? ""),
    });
  }
  return out;
}

async function ensurePainelRow(
  competencia: string,
  programacao: { id: string; nome: string; clienteRef: string; clienteNome: string },
) {
  return prisma.criacaoAtualizacaoPainel.upsert({
    where: {
      competencia_programacaoId: { competencia, programacaoId: programacao.id },
    },
    create: {
      competencia,
      programacaoId: programacao.id,
      clienteRef: programacao.clienteRef,
      clienteNome: programacao.clienteNome,
      programacaoNome: programacao.nome,
    },
    update: {
      clienteRef: programacao.clienteRef,
      clienteNome: programacao.clienteNome,
      programacaoNome: programacao.nome,
    },
  });
}

export async function listPainelCompetencia(competencia: string): Promise<PainelRow[]> {
  const programacoes = await prisma.programacao.findMany({
    orderBy: [{ clienteNome: "asc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      clienteRef: true,
      clienteNome: true,
    },
  });

  const emptyRow = (p: (typeof programacoes)[number]): PainelRow => ({
    programacaoId: p.id,
    programacaoNome: p.nome,
    clienteRef: p.clienteRef,
    clienteNome: p.clienteNome,
    criativoEntregue: false,
    criativoEntregueEm: null,
    criativoEntreguePor: "",
    subidaFila: false,
    subidaFilaEm: null,
    subidaFilaPor: "",
    fechamentos: [],
  });

  if (!(await hasAtualizacaoPainelTable())) {
    return programacoes.map(emptyRow);
  }

  const painelRows = await prisma.criacaoAtualizacaoPainel.findMany({
    where: { competencia },
  });
  const byProg = new Map(painelRows.map((r) => [r.programacaoId, r]));

  return programacoes.map((p) => {
    const row = byProg.get(p.id);
    const fechamentos = row ? parseFechamentos(row.fechamentosJson) : [];
    return {
      programacaoId: p.id,
      programacaoNome: p.nome,
      clienteRef: p.clienteRef,
      clienteNome: p.clienteNome,
      criativoEntregue: Boolean(row?.criativoEntregueEm),
      criativoEntregueEm: row?.criativoEntregueEm?.toISOString() ?? null,
      criativoEntreguePor: row?.criativoEntreguePor ?? "",
      subidaFila: Boolean(row?.subidaFilaEm),
      subidaFilaEm: row?.subidaFilaEm?.toISOString() ?? null,
      subidaFilaPor: row?.subidaFilaPor ?? "",
      fechamentos,
    };
  });
}

export async function toggleCriativoEntregue(
  programacaoId: string,
  competencia: string,
  por: string,
  entregue: boolean,
): Promise<PainelRow> {
  if (!(await hasAtualizacaoPainelTable())) {
    throw new Error("migration_pendente");
  }

  const prog = await prisma.programacao.findUnique({
    where: { id: programacaoId },
    select: { id: true, nome: true, clienteRef: true, clienteNome: true },
  });
  if (!prog) throw new Error("programacao_nao_encontrada");

  const row = await ensurePainelRow(competencia, prog);
  const updated = await prisma.criacaoAtualizacaoPainel.update({
    where: { id: row.id },
    data: entregue ?
      { criativoEntregueEm: new Date(), criativoEntreguePor: por.slice(0, 200) }
    : { criativoEntregueEm: null, criativoEntreguePor: "" },
  });

  return {
    programacaoId: prog.id,
    programacaoNome: prog.nome,
    clienteRef: prog.clienteRef,
    clienteNome: prog.clienteNome,
    criativoEntregue: Boolean(updated.criativoEntregueEm),
    criativoEntregueEm: updated.criativoEntregueEm?.toISOString() ?? null,
    criativoEntreguePor: updated.criativoEntreguePor,
    subidaFila: Boolean(updated.subidaFilaEm),
    subidaFilaEm: updated.subidaFilaEm?.toISOString() ?? null,
    subidaFilaPor: updated.subidaFilaPor,
    fechamentos: parseFechamentos(updated.fechamentosJson),
  };
}

export async function markSubidaFilaPainel(
  programacaoId: string,
  jobId: string,
  por: string,
  when = new Date(),
): Promise<void> {
  if (!(await hasAtualizacaoPainelTable())) return;

  const prog = await prisma.programacao.findUnique({
    where: { id: programacaoId },
    select: { id: true, nome: true, clienteRef: true, clienteNome: true },
  });
  if (!prog) return;

  const competencia = competenciaFromDate(when);
  const row = await ensurePainelRow(competencia, prog);
  if (row.subidaFilaEm) return;

  await prisma.criacaoAtualizacaoPainel.update({
    where: { id: row.id },
    data: {
      subidaFilaEm: when,
      subidaFilaPor: por.slice(0, 200),
      subidaFilaJobId: jobId,
    },
  });
}

export async function appendFechamentoPainel(input: {
  programacaoId: string;
  competencia: string;
  atualizacaoId: string;
  rotulo: string;
  tipo: "install" | "atl" | "especial";
  when?: Date;
}): Promise<void> {
  if (!(await hasAtualizacaoPainelTable())) return;

  const prog = await prisma.programacao.findUnique({
    where: { id: input.programacaoId },
    select: { id: true, nome: true, clienteRef: true, clienteNome: true },
  });
  if (!prog) return;

  const row = await ensurePainelRow(input.competencia, prog);
  const fechamentos = parseFechamentos(row.fechamentosJson);
  fechamentos.push({
    rotulo: input.rotulo,
    tipo: input.tipo,
    em: (input.when ?? new Date()).toISOString(),
    atualizacaoId: input.atualizacaoId,
  });

  await prisma.criacaoAtualizacaoPainel.update({
    where: { id: row.id },
    data: { fechamentosJson: fechamentos as unknown as Prisma.InputJsonValue },
  });
}
