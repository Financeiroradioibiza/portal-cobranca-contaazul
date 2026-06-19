import { prisma } from "@/lib/prisma";
import { compareRioLinhasByNomeFantasia } from "@/lib/rio/sortRioCompLinhas";
import { sortRioPdvsByNome } from "@/lib/rio/pdvNames";
import { pickVigenteRioYearMonth } from "@/lib/cadastros/vigenteRioMonth";
import { currentBrazilYearMonth } from "@/lib/manualReminders/yearMonth";
import {
  buildPortalPdvId,
  PORTAL_CLIENTE_ID_START,
} from "@/lib/player/portalPlayerIds";

export type AssignPortalPlayerIdsResult = {
  yearMonth: number;
  clientes: number;
  pdvs: number;
};

/**
 * Atribui IDs **somente onde ainda faltam** — nunca altera IDs existentes (estáveis para o Player).
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

  const linhas = await prisma.rioCompClienteLinha.findMany({
    where: { monthId: month.id, movimento: { not: "saida" } },
    select: {
      id: true,
      portalClienteId: true,
      pdvs: {
        where: { movimento: { not: "saida" } },
        select: { id: true, portalPdvId: true },
      },
    },
  });

  const { ensurePortalClienteIdForLinha, ensurePortalPdvIdForPdv } = await import(
    "@/lib/player/ensurePortalIds"
  );

  let clientes = 0;
  let pdvs = 0;

  for (const ln of linhas) {
    if (ln.portalClienteId == null) {
      await ensurePortalClienteIdForLinha(ln.id);
      clientes++;
    }
    for (const pdv of ln.pdvs) {
      if (pdv.portalPdvId == null) {
        await ensurePortalPdvIdForPdv(pdv.id);
        pdvs++;
      }
    }
  }

  return { yearMonth: ym, clientes, pdvs };
}

/**
 * Renumera portalClienteId (100+) e portalPdvId (100.001, …) por ordem alfabética.
 * **Destrutivo** — só usar na migração inicial. Depois preferir assignMissingPortalPlayerIds.
 */
export async function assignPortalPlayerIds(yearMonth?: number): Promise<AssignPortalPlayerIdsResult> {
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

  const linhas = await prisma.rioCompClienteLinha.findMany({
    where: { monthId: month.id, movimento: { not: "saida" } },
    select: {
      id: true,
      nomeFantasia: true,
      razaoSocial: true,
      pdvs: {
        where: { movimento: { not: "saida" } },
        select: { id: true, nome: true },
      },
    },
  });

  linhas.sort(compareRioLinhasByNomeFantasia);

  let nextClienteId = PORTAL_CLIENTE_ID_START;
  let clientes = 0;
  let pdvs = 0;

  await prisma.$transaction(async (tx) => {
    // Zera IDs antigos deste mês antes de reatribuir (evita conflito unique).
    await tx.rioCompPdv.updateMany({
      where: { cliente: { monthId: month.id } },
      data: { portalPdvId: null },
    });
    await tx.rioCompClienteLinha.updateMany({
      where: { monthId: month.id },
      data: { portalClienteId: null },
    });

    for (const linha of linhas) {
      const portalClienteId = nextClienteId++;
      await tx.rioCompClienteLinha.update({
        where: { id: linha.id },
        data: { portalClienteId },
      });
      clientes++;

      const pdvList = sortRioPdvsByNome(linha.pdvs);
      let seq = 1;
      for (const pdv of pdvList) {
        await tx.rioCompPdv.update({
          where: { id: pdv.id },
          data: { portalPdvId: buildPortalPdvId(portalClienteId, seq++) },
        });
        pdvs++;
      }
    }
  });

  return { yearMonth: ym, clientes, pdvs };
}
