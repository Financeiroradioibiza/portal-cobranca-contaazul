import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { shiftYearMonth } from "@/lib/manualReminders/yearMonth";
import { donorYearMonthFor, isUserMarcaGrupo } from "@/lib/rio/rioTurnover";
import { getRioCompMonthWithLinhas } from "@/lib/rio/rioClienteCompService";

/**
 * Copia competência anterior (MARCA, clientes, PDVs, vínculos CA) para o mês novo.
 * Fecha o mês doador. Não copia blocos sistema da virada.
 */
export async function cloneRioCompMonthFromDonor(targetYm: number) {
  const donorYm = donorYearMonthFor(targetYm);
  const donor = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: donorYm },
    include: {
      grupos: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      linhas: {
        orderBy: [{ sortOrder: "asc" }, { nomeFantasia: "asc" }],
        include: {
          pdvs: { orderBy: [{ nome: "asc" }, { id: "asc" }] },
        },
      },
    },
  });
  if (!donor) {
    throw new Error(`donor_month_not_found:${donorYm}`);
  }

  const existingTarget = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: targetYm },
    include: { linhas: { select: { id: true } } },
  });
  if (existingTarget?.linhas.length) {
    throw new Error("target_month_not_empty");
  }

  const target =
    existingTarget ??
    (await prisma.rioCompMonth.create({
      data: { yearMonth: targetYm },
    }));

  await prisma.$transaction(
    async (tx) => {
      await tx.rioCompClienteLinha.deleteMany({ where: { monthId: target.id } });
      await tx.rioCompGrupo.deleteMany({ where: { monthId: target.id } });

      const grupoMap = new Map<string, string>();
      for (const g of donor.grupos.filter(isUserMarcaGrupo)) {
        const ng = await tx.rioCompGrupo.create({
          data: {
            monthId: target.id,
            nome: g.nome,
            sortOrder: g.sortOrder,
            systemTag: null,
          },
        });
        grupoMap.set(g.id, ng.id);
      }

      let ord = 0;
      for (const l of donor.linhas) {
        const rioGrupoId =
          l.rioGrupoId && grupoMap.has(l.rioGrupoId) ? grupoMap.get(l.rioGrupoId)! : null;
        const nl = await tx.rioCompClienteLinha.create({
          data: {
            monthId: target.id,
            rioGrupoId,
            caPersonId: l.caPersonId,
            grupoSite: l.grupoSite,
            nomeFantasia: l.nomeFantasia,
            origemCliente: l.origemCliente,
            razaoSocial: l.razaoSocial,
            documento: l.documento,
            emailCobranca: l.emailCobranca,
            valorClienteTexto: l.valorClienteTexto,
            valorPdvUnitarioTexto: l.valorPdvUnitarioTexto,
            numeroPdvSite: l.numeroPdvSite,
            categoriaSite: l.categoriaSite,
            contratosAtivosTexto: l.contratosAtivosTexto,
            movimento: "estavel",
            observacoesLinha: l.observacoesLinha,
            sortOrder: ord++,
          },
        });
        let pi = 0;
        for (const p of l.pdvs) {
          await tx.rioCompPdv.create({
            data: {
              clienteId: nl.id,
              nome: p.nome,
              notes: p.notes,
              sortOrder: pi++,
              movimento: "estavel",
            },
          });
        }
      }

      await tx.rioCompMonth.update({
        where: { id: donor.id },
        data: { closedAt: new Date() },
      });
    },
    { timeout: 240_000, maxWait: 45_000 },
  );

  const full = await getRioCompMonthWithLinhas(targetYm);
  if (!full) throw new Error("hydrate_failed");
  return {
    donorYearMonth: donorYm,
    closedDonor: true,
    ...full,
  };
}

/**
 * Sem snapshot: repõe a competência como cópia do mês civil anterior
 * (MARCA + clientes + PDVs). Útil após sync destrutivo em maio ou virada em junho+.
 */
export async function revertRioCompMonthToDonorClone(targetYm: number) {
  const donorYm = donorYearMonthFor(targetYm);
  const donor = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: donorYm },
    include: {
      grupos: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      linhas: {
        orderBy: [{ sortOrder: "asc" }, { nomeFantasia: "asc" }],
        include: { pdvs: { orderBy: [{ nome: "asc" }, { id: "asc" }] } },
      },
    },
  });
  if (!donor) throw new Error(`donor_month_not_found:${donorYm}`);

  const target = await prisma.rioCompMonth.findUnique({ where: { yearMonth: targetYm } });
  if (!target) throw new Error("month_not_found");
  if (target.closedAt) throw new Error("month_closed");

  await prisma.$transaction(
    async (tx) => {
      await tx.rioCompClienteLinha.deleteMany({ where: { monthId: target.id } });
      await tx.rioCompGrupo.deleteMany({ where: { monthId: target.id } });

      const grupoMap = new Map<string, string>();
      for (const g of donor.grupos.filter(isUserMarcaGrupo)) {
        const ng = await tx.rioCompGrupo.create({
          data: {
            monthId: target.id,
            nome: g.nome,
            sortOrder: g.sortOrder,
            systemTag: null,
          },
        });
        grupoMap.set(g.id, ng.id);
      }

      let ord = 0;
      for (const l of donor.linhas) {
        const rioGrupoId =
          l.rioGrupoId && grupoMap.has(l.rioGrupoId) ? grupoMap.get(l.rioGrupoId)! : null;
        const nl = await tx.rioCompClienteLinha.create({
          data: {
            monthId: target.id,
            rioGrupoId,
            caPersonId: l.caPersonId,
            grupoSite: l.grupoSite,
            nomeFantasia: l.nomeFantasia,
            origemCliente: l.origemCliente,
            razaoSocial: l.razaoSocial,
            documento: l.documento,
            emailCobranca: l.emailCobranca,
            valorClienteTexto: l.valorClienteTexto,
            valorPdvUnitarioTexto: l.valorPdvUnitarioTexto,
            numeroPdvSite: l.numeroPdvSite,
            categoriaSite: l.categoriaSite,
            contratosAtivosTexto: l.contratosAtivosTexto,
            movimento: "estavel",
            observacoesLinha: l.observacoesLinha,
            sortOrder: ord++,
          },
        });
        let pi = 0;
        for (const p of l.pdvs) {
          await tx.rioCompPdv.create({
            data: {
              clienteId: nl.id,
              nome: p.nome,
              notes: p.notes,
              sortOrder: pi++,
              movimento: "estavel",
            },
          });
        }
      }
    },
    { timeout: 240_000, maxWait: 45_000 },
  );

  await prisma.rioCompMonth.update({
    where: { id: target.id },
    data: { preSyncSnapshot: Prisma.DbNull, lastSyncedAt: null },
  });

  const full = await getRioCompMonthWithLinhas(targetYm);
  if (!full) throw new Error("hydrate_failed");
  return {
    donorYearMonth: donorYm,
    linhaCount: full.linhas.length,
    ...full,
  };
}

/** @deprecated use revertRioCompMonthToDonorClone */
export const revertRioViradaToDonorClone = revertRioCompMonthToDonorClone;
