import type { PlanilhaProdSistema as PrismaSistema } from "@prisma/client";
import type { PlanilhaProdImportMonth } from "@/lib/criacao/planilhaProdImport";
import { hasPlanilhaProdTable } from "@/lib/criacao/planilhaProdSchemaCompat";
import type {
  PlanilhaProdMonthDto,
  PlanilhaProdMonthPayload,
  PlanilhaProdRowDto,
  PlanilhaProdSistema,
} from "@/lib/criacao/planilhaProdTypes";
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
}): PlanilhaProdRowDto {
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
    sortOrder: row.sortOrder,
  };
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
    rows: rows.map(toRowDto),
  };
}

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
      entregaAtl: nextPatch.entregaAtl ?? undefined,
      convertidoGain: nextPatch.convertidoGain ?? undefined,
      arrastado: nextPatch.arrastado ?? undefined,
      sincronizado: nextPatch.sincronizado ?? undefined,
      statusPlayerNovo: nextPatch.statusPlayerNovo ?? undefined,
      obsCriacao: nextPatch.obsCriacao ?? undefined,
      obsProducao: nextPatch.obsProducao ?? undefined,
      linkedClienteRef: nextPatch.linkedClienteRef ?? undefined,
      linkedProgramacaoId: nextPatch.linkedProgramacaoId ?? undefined,
      linkedClienteNome: nextPatch.linkedClienteNome ?? undefined,
      linkedProgramacaoNome: nextPatch.linkedProgramacaoNome ?? undefined,
    },
  });

  return { row: toRowDto(updated) };
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
