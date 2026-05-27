import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type RioPreSyncSnapshot = {
  savedAt: string;
  grupos: Array<{
    id: string;
    nome: string;
    sortOrder: number;
    systemTag: string | null;
  }>;
  linhas: Array<{
    caPersonId: string;
    rioGrupoId: string | null;
    grupoSite: string;
    nomeFantasia: string;
    razaoSocial: string;
    documento: string | null;
    emailCobranca: string | null;
    valorClienteTexto: string;
    valorPdvUnitarioTexto: string;
    numeroPdvSite: number;
    categoriaSite: string;
    contratosAtivosTexto: string;
    movimento: string;
    observacoesLinha: string;
    sortOrder: number;
    pdvs: Array<{ nome: string; notes: string; sortOrder: number; movimento: string }>;
  }>;
};

export async function captureRioPreSyncSnapshot(monthId: string): Promise<RioPreSyncSnapshot> {
  const month = await prisma.rioCompMonth.findUnique({
    where: { id: monthId },
    include: {
      grupos: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      linhas: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { pdvs: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
      },
    },
  });
  if (!month) throw new Error("month_not_found");

  return {
    savedAt: new Date().toISOString(),
    grupos: month.grupos.map((g) => ({
      id: g.id,
      nome: g.nome,
      sortOrder: g.sortOrder,
      systemTag: g.systemTag,
    })),
    linhas: month.linhas.map((l) => ({
      caPersonId: l.caPersonId,
      rioGrupoId: l.rioGrupoId,
      grupoSite: l.grupoSite,
      nomeFantasia: l.nomeFantasia,
      razaoSocial: l.razaoSocial,
      documento: l.documento,
      emailCobranca: l.emailCobranca,
      valorClienteTexto: l.valorClienteTexto,
      valorPdvUnitarioTexto: l.valorPdvUnitarioTexto,
      numeroPdvSite: l.numeroPdvSite,
      categoriaSite: l.categoriaSite,
      contratosAtivosTexto: l.contratosAtivosTexto,
      movimento: l.movimento,
      observacoesLinha: l.observacoesLinha,
      sortOrder: l.sortOrder,
      pdvs: l.pdvs.map((p) => ({
        nome: p.nome,
        notes: p.notes,
        sortOrder: p.sortOrder,
        movimento: p.movimento,
      })),
    })),
  };
}

/** Grava snapshot JSON no mês (antes de sync destrutivo). */
export async function saveRioPreSyncSnapshot(monthId: string): Promise<RioPreSyncSnapshot> {
  const snap = await captureRioPreSyncSnapshot(monthId);
  await prisma.rioCompMonth.update({
    where: { id: monthId },
    data: { preSyncSnapshot: snap as unknown as Prisma.InputJsonValue },
  });
  return snap;
}

export async function restoreRioCompMonthFromPreSyncSnapshot(yearMonth: number): Promise<{
  restoredAt: string;
  grupos: number;
  linhas: number;
}> {
  const month = await prisma.rioCompMonth.findUnique({ where: { yearMonth } });
  if (!month) throw new Error("month_not_found");
  if (month.closedAt) throw new Error("month_closed");

  const raw = month.preSyncSnapshot;
  if (!raw || typeof raw !== "object") throw new Error("no_pre_sync_snapshot");

  const snap = raw as RioPreSyncSnapshot;
  if (!Array.isArray(snap.linhas) || !Array.isArray(snap.grupos)) {
    throw new Error("invalid_pre_sync_snapshot");
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.rioCompClienteLinha.deleteMany({ where: { monthId: month.id } });
      await tx.rioCompGrupo.deleteMany({ where: { monthId: month.id } });

      const grupoMap = new Map<string, string>();
      for (const g of snap.grupos) {
        const ng = await tx.rioCompGrupo.create({
          data: {
            monthId: month.id,
            nome: g.nome,
            sortOrder: g.sortOrder,
            systemTag: g.systemTag,
          },
        });
        grupoMap.set(g.id, ng.id);
      }

      for (const l of snap.linhas) {
        const rioGrupoId =
          l.rioGrupoId && grupoMap.has(l.rioGrupoId) ? grupoMap.get(l.rioGrupoId)! : null;
        const nl = await tx.rioCompClienteLinha.create({
          data: {
            monthId: month.id,
            caPersonId: l.caPersonId,
            rioGrupoId,
            grupoSite: l.grupoSite,
            nomeFantasia: l.nomeFantasia,
            razaoSocial: l.razaoSocial,
            documento: l.documento,
            emailCobranca: l.emailCobranca,
            valorClienteTexto: l.valorClienteTexto,
            valorPdvUnitarioTexto: l.valorPdvUnitarioTexto,
            numeroPdvSite: l.numeroPdvSite,
            categoriaSite: l.categoriaSite,
            contratosAtivosTexto: l.contratosAtivosTexto,
            movimento: l.movimento as "estavel" | "entrada" | "saida",
            observacoesLinha: l.observacoesLinha,
            sortOrder: l.sortOrder,
          },
        });
        if (l.pdvs.length) {
          await tx.rioCompPdv.createMany({
            data: l.pdvs.map((p) => ({
              clienteId: nl.id,
              nome: p.nome,
              notes: p.notes,
              sortOrder: p.sortOrder,
              movimento: p.movimento as "estavel" | "entrada" | "saida",
            })),
          });
        }
      }
    },
    { timeout: 240_000, maxWait: 45_000 },
  );

  await prisma.rioCompMonth.update({
    where: { id: month.id },
    data: { preSyncSnapshot: Prisma.DbNull },
  });

  return {
    restoredAt: snap.savedAt,
    grupos: snap.grupos.length,
    linhas: snap.linhas.length,
  };
}

/** Remove linhas vinculadas à CA que não estão na listagem de clientes **ativos**. */
export async function purgeRioCaLinhasNotInActiveSet(
  monthId: string,
  activeCaPersonIds: Set<string>,
): Promise<{ removed: number }> {
  const { isRioCaPersonLinked } = await import("@/lib/rio/rioCaPersonLink");
  const linhas = await prisma.rioCompClienteLinha.findMany({
    where: { monthId },
    select: { id: true, caPersonId: true },
  });
  const toRemove = linhas.filter(
    (l) => isRioCaPersonLinked(l.caPersonId) && !activeCaPersonIds.has(l.caPersonId.trim()),
  );
  if (toRemove.length) {
    await prisma.rioCompClienteLinha.deleteMany({
      where: { id: { in: toRemove.map((x) => x.id) } },
    });
  }
  return { removed: toRemove.length };
}
