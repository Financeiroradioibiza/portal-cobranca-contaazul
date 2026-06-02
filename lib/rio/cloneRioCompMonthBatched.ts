import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { donorYearMonthFor, isUserMarcaGrupo } from "@/lib/rio/rioTurnover";
import { getRioCompMonthWithLinhas } from "@/lib/rio/rioClienteCompService";

export const RIO_CLONE_DONOR_BATCH_SIZE = 10;

export type DonorCloneState = {
  donorYearMonth: number;
  grupoMap: Record<string, string>;
  donorLinhaIds: string[];
  closeDonorWhenDone: boolean;
};

function parseState(raw: Prisma.JsonValue | null): DonorCloneState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as DonorCloneState;
  if (!o.donorYearMonth || !Array.isArray(o.donorLinhaIds) || !o.grupoMap) return null;
  return o;
}

async function loadDonorAndTarget(targetYm: number) {
  const donorYm = donorYearMonthFor(targetYm);
  const donor = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: donorYm },
    include: {
      grupos: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
    },
  });
  if (!donor) throw new Error(`donor_month_not_found:${donorYm}`);

  let target = await prisma.rioCompMonth.findUnique({ where: { yearMonth: targetYm } });
  if (!target) {
    target = await prisma.rioCompMonth.create({ data: { yearMonth: targetYm } });
  }
  if (target.closedAt) throw new Error("month_closed");

  return { donor, donorYm, target };
}

/** Apaga destino, copia MARCAs e grava fila de linhas do doador. */
export async function cloneDonorReset(targetYm: number, opts?: { closeDonorWhenDone?: boolean }) {
  const { donor, donorYm, target } = await loadDonorAndTarget(targetYm);

  await prisma.rioCompClienteLinha.deleteMany({ where: { monthId: target.id } });
  await prisma.rioCompGrupo.deleteMany({ where: { monthId: target.id } });

  const grupoMap: Record<string, string> = {};
  for (const g of donor.grupos.filter(isUserMarcaGrupo)) {
    const ng = await prisma.rioCompGrupo.create({
      data: {
        monthId: target.id,
        nome: g.nome,
        sortOrder: g.sortOrder,
        systemTag: null,
      },
    });
    grupoMap[g.id] = ng.id;
  }

  const donorLinhaIds = (
    await prisma.rioCompClienteLinha.findMany({
      where: { monthId: donor.id },
      orderBy: [{ sortOrder: "asc" }, { nomeFantasia: "asc" }, { id: "asc" }],
      select: { id: true },
    })
  ).map((r) => r.id);

  const state: DonorCloneState = {
    donorYearMonth: donorYm,
    grupoMap,
    donorLinhaIds,
    closeDonorWhenDone: opts?.closeDonorWhenDone === true,
  };

  await prisma.rioCompMonth.update({
    where: { id: target.id },
    data: {
      cloneDonorState: state as unknown as Prisma.InputJsonValue,
      preSyncSnapshot: Prisma.DbNull,
      lastSyncedAt: null,
      viradaPrepare: Prisma.DbNull,
    },
  });

  return {
    donorYearMonth: donorYm,
    totalLinhas: donorLinhaIds.length,
    grupoCount: Object.keys(grupoMap).length,
  };
}

/** Copia até `limit` clientes (+ PDVs) do doador. */
export async function cloneDonorLinhasBatch(
  targetYm: number,
  offset: number,
  limit: number,
): Promise<{
  copied: number;
  total: number;
  nextOffset: number;
  hasMore: boolean;
}> {
  const target = await prisma.rioCompMonth.findUnique({ where: { yearMonth: targetYm } });
  if (!target) throw new Error("month_not_found");
  const state = parseState(target.cloneDonorState);
  if (!state) throw new Error("clone_donor_not_started");

  const off = Math.max(0, Math.floor(offset));
  const lim = Math.min(25, Math.max(1, Math.floor(limit) || RIO_CLONE_DONOR_BATCH_SIZE));
  const sliceIds = state.donorLinhaIds.slice(off, off + lim);
  const total = state.donorLinhaIds.length;

  if (sliceIds.length === 0) {
    return { copied: 0, total, nextOffset: off, hasMore: off < total };
  }

  const donor = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: state.donorYearMonth },
    select: { id: true },
  });
  if (!donor) throw new Error(`donor_month_not_found:${state.donorYearMonth}`);

  const linhas = await prisma.rioCompClienteLinha.findMany({
    where: { id: { in: sliceIds }, monthId: donor.id },
    include: { pdvs: { orderBy: [{ nome: "asc" }, { id: "asc" }] } },
  });
  const byId = new Map(linhas.map((l) => [l.id, l]));

  let copied = 0;
  for (let i = 0; i < sliceIds.length; i++) {
    const l = byId.get(sliceIds[i]);
    if (!l) continue;
    const rioGrupoId =
      l.rioGrupoId && state.grupoMap[l.rioGrupoId] ? state.grupoMap[l.rioGrupoId] : null;
    const nl = await prisma.rioCompClienteLinha.create({
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
        sortOrder: off + i,
      },
    });
    if (l.pdvs.length > 0) {
      await prisma.rioCompPdv.createMany({
        data: l.pdvs.map((p, pi) => ({
          clienteId: nl.id,
          nome: p.nome,
          notes: p.notes,
          sortOrder: pi,
          movimento: "estavel" as const,
        })),
      });
    }
    copied += 1;
  }

  const nextOffset = off + sliceIds.length;
  return {
    copied,
    total,
    nextOffset,
    hasMore: nextOffset < total,
  };
}

export async function cloneDonorFinish(targetYm: number) {
  const target = await prisma.rioCompMonth.findUnique({ where: { yearMonth: targetYm } });
  if (!target) throw new Error("month_not_found");
  const state = parseState(target.cloneDonorState);
  if (!state) throw new Error("clone_donor_not_started");

  if (state.closeDonorWhenDone) {
    const donor = await prisma.rioCompMonth.findUnique({
      where: { yearMonth: state.donorYearMonth },
      select: { id: true },
    });
    if (donor) {
      await prisma.rioCompMonth.update({
        where: { id: donor.id },
        data: { closedAt: new Date() },
      });
    }
  }

  await prisma.rioCompMonth.update({
    where: { id: target.id },
    data: { cloneDonorState: Prisma.DbNull },
  });

  const full = await getRioCompMonthWithLinhas(targetYm);
  if (!full) throw new Error("hydrate_failed");
  return {
    donorYearMonth: state.donorYearMonth,
    linhaCount: full.linhas.length,
    closedDonor: state.closeDonorWhenDone,
    ...full,
  };
}
