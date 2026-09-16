import type { PlanilhaProdSistema as PrismaSistema } from "@prisma/client";
import type { PlanilhaProdImportMonth } from "@/lib/criacao/planilhaProdImport";
import { hasPlanilhaProdTable } from "@/lib/criacao/planilhaProdSchemaCompat";
import {
  loadPlanilhaProdRioTagByClienteRef,
  resolvePlanilhaProdLinkedRioTag,
} from "@/lib/criacao/planilhaProdRioTags";
import type {
  PlanilhaProdMonthDto,
  PlanilhaProdMonthPayload,
  PlanilhaProdRowDto,
  PlanilhaProdSistema,
} from "@/lib/criacao/planilhaProdTypes";
import type { RioTagCobranca } from "@/lib/rio/rioTagCobranca";
import { prisma } from "@/lib/prisma";

function toRowDto(row: {
  id: string;
  monthId: string;
  sistema: PrismaSistema;
  clienteLabel: string;
  criativo: string;
  entregaAtl: string;
  convertidoGain: string;
  arrastado: string;
  sincronizado: string;
  statusPlayerNovo: string;
  obsCriacao: string;
  obsProducao: string;
  linkedClienteRef: string;
  linkedProgramacaoId: string;
  linkedClienteNome: string;
  linkedProgramacaoNome: string;
  sortOrder: number;
}, linkedRioTagCobranca: RioTagCobranca | null = null): PlanilhaProdRowDto {
  return {
    id: row.id,
    monthId: row.monthId,
    sistema: row.sistema as PlanilhaProdSistema,
    clienteLabel: row.clienteLabel,
    criativo: row.criativo,
    entregaAtl: row.entregaAtl,
    convertidoGain: row.convertidoGain,
    arrastado: row.arrastado,
    sincronizado: row.sincronizado,
    statusPlayerNovo: row.statusPlayerNovo,
    obsCriacao: row.obsCriacao,
    obsProducao: row.obsProducao,
    linkedClienteRef: row.linkedClienteRef,
    linkedProgramacaoId: row.linkedProgramacaoId,
    linkedClienteNome: row.linkedClienteNome,
    linkedProgramacaoNome: row.linkedProgramacaoNome,
    linkedRioTagCobranca,
    sortOrder: row.sortOrder,
  };
}

async function enrichRowsWithRioTags(rows: Parameters<typeof toRowDto>[0][]): Promise<PlanilhaProdRowDto[]> {
  const tagByRef = await loadPlanilhaProdRioTagByClienteRef();
  return rows.map((row) =>
    toRowDto(row, resolvePlanilhaProdLinkedRioTag(row.linkedClienteRef, tagByRef)),
  );
}

export async function listPlanilhaProdMonths(): Promise<PlanilhaProdMonthDto[]> {
  if (!(await hasPlanilhaProdTable())) return [];
  const months = await prisma.planilhaProdMonth.findMany({
    orderBy: { sortKey: "desc" },
    include: { _count: { select: { rows: true } } },
  });
  return months.map((m) => ({
    id: m.id,
    slug: m.slug,
    label: m.label,
    sortKey: m.sortKey,
    rowCount: m._count.rows,
  }));
}

export async function getPlanilhaProdMonth(monthId: string): Promise<PlanilhaProdMonthPayload | null> {
  if (!(await hasPlanilhaProdTable())) return null;
  const month = await prisma.planilhaProdMonth.findUnique({
    where: { id: monthId },
    include: { _count: { select: { rows: true } } },
  });
  if (!month) return null;
  const rows = await prisma.planilhaProdRow.findMany({
    where: { monthId },
    orderBy: [{ criativo: "asc" }, { sortOrder: "asc" }],
  });
  return {
    month: {
      id: month.id,
      slug: month.slug,
      label: month.label,
      sortKey: month.sortKey,
      rowCount: month._count.rows,
    },
    rows: await enrichRowsWithRioTags(rows),
  };
}

export type PlanilhaProdRowCreate = {
  monthId: string;
  criativo: string;
  clienteLabel: string;
  sistema?: PlanilhaProdSistema;
  linkedClienteRef?: string;
  linkedProgramacaoId?: string;
  linkedClienteNome?: string;
  linkedProgramacaoNome?: string;
};

export type PlanilhaProdRowPatch = Partial<{
  sistema: PlanilhaProdSistema;
  clienteLabel: string;
  criativo: string;
  entregaAtl: string;
  convertidoGain: string;
  arrastado: string;
  sincronizado: string;
  statusPlayerNovo: string;
  obsCriacao: string;
  obsProducao: string;
  linkedClienteRef: string;
  linkedProgramacaoId: string;
  linkedClienteNome: string;
  linkedProgramacaoNome: string;
}>;

function sanitizeSistema(value: unknown): PlanilhaProdSistema | null {
  if (value === "painel" || value === "dois_sistemas" || value === "player5" || value === "cancelado") {
    return value;
  }
  return null;
}

function applySistemaLinkRules(
  sistema: PlanilhaProdSistema,
  patch: PlanilhaProdRowPatch,
): PlanilhaProdRowPatch {
  if (sistema === "painel" || sistema === "cancelado") {
    return {
      ...patch,
      linkedClienteRef: "",
      linkedProgramacaoId: "",
      linkedClienteNome: "",
      linkedProgramacaoNome: "",
    };
  }
  return patch;
}

export async function createPlanilhaProdRow(
  input: PlanilhaProdRowCreate,
): Promise<{ row?: PlanilhaProdRowDto; error?: string }> {
  if (!(await hasPlanilhaProdTable())) return { error: "migration_pendente" };

  const monthId = input.monthId.trim();
  if (!monthId) return { error: "mes_obrigatorio" };

  const month = await prisma.planilhaProdMonth.findUnique({ where: { id: monthId } });
  if (!month) return { error: "mes_nao_encontrado" };

  const criativo = input.criativo.replace(/\s+/g, " ").trim().toUpperCase();
  if (!criativo) return { error: "criativo_obrigatorio" };

  const clienteLabel = input.clienteLabel.trim();
  if (!clienteLabel) return { error: "cliente_obrigatorio" };

  const sistema = sanitizeSistema(input.sistema) ?? "painel";
  const linkPatch = applySistemaLinkRules(sistema, {
    linkedClienteRef: input.linkedClienteRef ?? "",
    linkedProgramacaoId: input.linkedProgramacaoId ?? "",
    linkedClienteNome: input.linkedClienteNome ?? "",
    linkedProgramacaoNome: input.linkedProgramacaoNome ?? "",
  });

  const maxOrder = await prisma.planilhaProdRow.aggregate({
    where: { monthId },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

  const created = await prisma.planilhaProdRow.create({
    data: {
      monthId,
      criativo,
      clienteLabel,
      sistema,
      sortOrder,
      linkedClienteRef: linkPatch.linkedClienteRef ?? "",
      linkedProgramacaoId: linkPatch.linkedProgramacaoId ?? "",
      linkedClienteNome: linkPatch.linkedClienteNome ?? "",
      linkedProgramacaoNome: linkPatch.linkedProgramacaoNome ?? "",
    },
  });

  const tagByRef = await loadPlanilhaProdRioTagByClienteRef();
  return {
    row: toRowDto(created, resolvePlanilhaProdLinkedRioTag(created.linkedClienteRef, tagByRef)),
  };
}

export async function patchPlanilhaProdRow(
  rowId: string,
  patch: PlanilhaProdRowPatch,
): Promise<{ row?: PlanilhaProdRowDto; error?: string }> {
  if (!(await hasPlanilhaProdTable())) return { error: "migration_pendente" };

  const current = await prisma.planilhaProdRow.findUnique({ where: { id: rowId } });
  if (!current) return { error: "nao_encontrado" };

  const sistema = sanitizeSistema(patch.sistema) ?? (current.sistema as PlanilhaProdSistema);
  let nextPatch = applySistemaLinkRules(sistema, { ...patch, sistema });

  const updated = await prisma.planilhaProdRow.update({
    where: { id: rowId },
    data: {
      sistema,
      clienteLabel: nextPatch.clienteLabel ?? undefined,
      criativo: nextPatch.criativo ? nextPatch.criativo.replace(/\s+/g, " ").trim().toUpperCase() : undefined,
      entregaAtl: "entregaAtl" in nextPatch ? nextPatch.entregaAtl : undefined,
      convertidoGain: "convertidoGain" in nextPatch ? nextPatch.convertidoGain : undefined,
      arrastado: "arrastado" in nextPatch ? nextPatch.arrastado : undefined,
      sincronizado: "sincronizado" in nextPatch ? nextPatch.sincronizado : undefined,
      statusPlayerNovo: "statusPlayerNovo" in nextPatch ? nextPatch.statusPlayerNovo : undefined,
      obsCriacao: "obsCriacao" in nextPatch ? nextPatch.obsCriacao : undefined,
      obsProducao: "obsProducao" in nextPatch ? nextPatch.obsProducao : undefined,
      linkedClienteRef: nextPatch.linkedClienteRef ?? undefined,
      linkedProgramacaoId: nextPatch.linkedProgramacaoId ?? undefined,
      linkedClienteNome: nextPatch.linkedClienteNome ?? undefined,
      linkedProgramacaoNome: nextPatch.linkedProgramacaoNome ?? undefined,
    },
  });

  const tagByRef = await loadPlanilhaProdRioTagByClienteRef();
  return {
    row: toRowDto(updated, resolvePlanilhaProdLinkedRioTag(updated.linkedClienteRef, tagByRef)),
  };
}

/** Só linhas com sistema cancelado podem ser apagadas. */
export async function deletePlanilhaProdRow(rowId: string): Promise<{ ok?: boolean; error?: string }> {
  if (!(await hasPlanilhaProdTable())) return { error: "migration_pendente" };

  const current = await prisma.planilhaProdRow.findUnique({ where: { id: rowId } });
  if (!current) return { error: "nao_encontrado" };
  if (current.sistema !== "cancelado") return { error: "so_cancelado" };

  await prisma.planilhaProdRow.delete({ where: { id: rowId } });
  return { ok: true };
}

export async function importPlanilhaProdMonths(months: PlanilhaProdImportMonth[]): Promise<{
  months: number;
  rows: number;
}> {
  if (!(await hasPlanilhaProdTable())) {
    throw new Error("migration_pendente");
  }

  let totalRows = 0;

  await prisma.$transaction(async (tx) => {
    await tx.planilhaProdRow.deleteMany();
    await tx.planilhaProdMonth.deleteMany();

    for (const month of months) {
      const created = await tx.planilhaProdMonth.create({
        data: {
          slug: month.slug,
          label: month.label,
          sortKey: month.sortKey,
        },
      });

      if (month.rows.length === 0) continue;

      await tx.planilhaProdRow.createMany({
        data: month.rows.map((r) => ({
          monthId: created.id,
          sistema: r.sistema,
          clienteLabel: r.clienteLabel,
          criativo: r.criativo,
          entregaAtl: r.entregaAtl,
          convertidoGain: r.convertidoGain,
          arrastado: r.arrastado,
          sincronizado: r.sincronizado,
          statusPlayerNovo: r.statusPlayerNovo,
          obsCriacao: r.obsCriacao,
          obsProducao: r.obsProducao,
          sortOrder: r.sortOrder,
        })),
      });
      totalRows += month.rows.length;
    }
  });

  return { months: months.length, rows: totalRows };
}
