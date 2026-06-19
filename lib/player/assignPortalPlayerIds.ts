import { pickVigenteRioYearMonth } from "@/lib/cadastros/vigenteRioMonth";
import { currentBrazilYearMonth } from "@/lib/manualReminders/yearMonth";
import { prisma } from "@/lib/prisma";
import {
  assignMissingProducaoPlayerIds,
  renumberProducaoPlayerIds,
} from "@/lib/player/producaoPlayerBuckets";

export type AssignPortalPlayerIdsResult = {
  yearMonth: number;
  clientes: number;
  pdvs: number;
};

/**
 * Realinha **todos** os IDs à produção musical (100, 100.001… por bucket).
 * Substitui numeração herdada do painel legado / Planilha Rio.
 */
export async function realignPortalPlayerIds(
  yearMonth?: number,
): Promise<AssignPortalPlayerIdsResult> {
  const months = await prisma.rioCompMonth.findMany({
    orderBy: { yearMonth: "desc" },
    select: { yearMonth: true },
  });
  const ym = yearMonth ?? pickVigenteRioYearMonth(months, currentBrazilYearMonth());

  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: ym },
    select: { id: true },
  });
  if (!month) throw new Error("rio_month_not_found");

  const { clientes, pdvs } = await renumberProducaoPlayerIds(ym);
  return { yearMonth: ym, clientes, pdvs };
}

/**
 * Atribui IDs **somente onde ainda faltam** — útil após incluir PDV novo na produção.
 */
export async function assignMissingPortalPlayerIds(
  yearMonth?: number,
): Promise<AssignPortalPlayerIdsResult> {
  const months = await prisma.rioCompMonth.findMany({
    orderBy: { yearMonth: "desc" },
    select: { yearMonth: true },
  });
  const ym = yearMonth ?? pickVigenteRioYearMonth(months, currentBrazilYearMonth());

  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: ym },
    select: { id: true },
  });
  if (!month) throw new Error("rio_month_not_found");

  const { clientes, pdvs } = await assignMissingProducaoPlayerIds(ym);
  return { yearMonth: ym, clientes, pdvs };
}

/** @deprecated use realignPortalPlayerIds */
export const assignPortalPlayerIds = realignPortalPlayerIds;
