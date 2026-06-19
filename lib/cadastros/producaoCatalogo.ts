import { getConfig, setConfig } from "@/lib/config/portalConfigService";
import { currentBrazilYearMonth } from "@/lib/manualReminders/yearMonth";
import { prisma } from "@/lib/prisma";

/** Layout operacional único (produção / IDs Player) — independente da virada Rio. */
export const PRODUCAO_CATALOGO_LAYOUT_YM = 0;

export const PRODUCAO_CONFIG_KEYS = {
  /** Competência Rio usada só como espelho de leitura (nomes/PDVs); nunca atualizada pela virada. */
  rioSourceYm: "producao.rio_source_ym",
} as const;

export function isProducaoCatalogLayoutYm(yearMonth: number): boolean {
  return yearMonth === PRODUCAO_CATALOGO_LAYOUT_YM;
}

/** Competência Rio pinada para espelho operacional (somente leitura). */
export async function getProducaoRioSourceYm(): Promise<number> {
  const raw = await getConfig(PRODUCAO_CONFIG_KEYS.rioSourceYm);
  const pinned = Number(raw);
  if (Number.isFinite(pinned) && pinned > 0) {
    const exists = await prisma.rioCompMonth.findUnique({
      where: { yearMonth: Math.trunc(pinned) },
      select: { yearMonth: true },
    });
    if (exists) return exists.yearMonth;
  }

  const latest = await prisma.rioCompMonth.findFirst({
    orderBy: { yearMonth: "desc" },
    select: { yearMonth: true },
  });
  return latest?.yearMonth ?? currentBrazilYearMonth();
}

export async function setProducaoRioSourceYm(
  yearMonth: number,
  updatedBy: string,
): Promise<void> {
  const ym = Math.trunc(yearMonth);
  if (ym <= 0) throw new Error("invalid_rio_source_ym");
  const exists = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: ym },
    select: { id: true },
  });
  if (!exists) throw new Error("rio_month_not_found");
  await setConfig(PRODUCAO_CONFIG_KEYS.rioSourceYm, String(ym), updatedBy);
}

export type ProducaoCatalogMeta = {
  layoutYearMonth: number;
  rioSourceYearMonth: number;
};

export async function getProducaoCatalogMeta(): Promise<ProducaoCatalogMeta> {
  const rioSourceYearMonth = await getProducaoRioSourceYm();
  return {
    layoutYearMonth: PRODUCAO_CATALOGO_LAYOUT_YM,
    rioSourceYearMonth,
  };
}
