import { Prisma } from "@prisma/client";
import type { RioClienteCompMovimento } from "@prisma/client";
import {
  fetchActiveClientePersonPage,
  type CaClienteActiveSummary,
} from "@/lib/contaazul/activeClientesCa";
import { fetchActiveContractSummaryForClient } from "@/lib/contaazul/contracts";
import { cobrancaPlusPrincipalEmailsJoined } from "@/lib/contaazul/personBilling";
import { normalizeBrazilianTaxIdForStorage } from "@/lib/format";
import { mergeValorClienteFromContaAzul } from "@/lib/rio/valorClienteCalc";
import { prisma } from "@/lib/prisma";
import { isRioCaPersonLinked } from "@/lib/rio/rioCaPersonLink";
import {
  enrichPersonRowsByIdsBatch,
  getRioCompMonthWithLinhas,
  type SyncRioCompFromCaOptions,
} from "@/lib/rio/rioClienteCompService";
import { saveRioPreSyncSnapshot } from "@/lib/rio/rioCompSyncSnapshot";
import {
  ensureRioSystemGrupos,
  type ViradaStats,
} from "@/lib/rio/rioViradaMes";
import { isRioTurnoverMonth } from "@/lib/rio/rioTurnover";

export const RIO_VIRADA_LINHAS_BATCH = 10;

export type ViradaPrepareStored = {
  summariesById: Record<
    string,
    { id: string; nomeLista: string; documento: string | null }
  >;
  activeIds: string[];
  caPagesLoaded: number;
  startedAt: string;
};

function asRecord(o: unknown): Record<string, unknown> | null {
  return typeof o === "object" && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function nomeFantasiaFromRaw(row: Record<string, unknown>, fallback: string): string {
  return (
    str(row.nome_fantasia) ||
    str(row.nomeFantasia) ||
    str(row.nome) ||
    str(row.name) ||
    fallback
  );
}

function razaoFromRaw(row: Record<string, unknown>, fallback: string): string {
  return str(row.razao_social) || str(row.razaoSocial) || fallback;
}

function documentoFromRaw(row: Record<string, unknown>, fallback: string | null): string | null {
  const d = str(row.documento) || str(row.cnpj) || str(row.cpf);
  return normalizeBrazilianTaxIdForStorage(d || fallback);
}

function valorClienteFromRaw(row: Record<string, unknown>): string {
  for (const k of ["valor_mensal", "valorMensal", "limite_credito", "limiteCredito"] as const) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 200);
  }
  return "";
}

function parsePrepare(raw: Prisma.JsonValue | null): ViradaPrepareStored | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as ViradaPrepareStored;
  if (!o.summariesById || !Array.isArray(o.activeIds)) return null;
  return o;
}

function emptyPrepare(): ViradaPrepareStored {
  return {
    summariesById: {},
    activeIds: [],
    caPagesLoaded: 0,
    startedAt: new Date().toISOString(),
  };
}

export async function assertViradaMonthOpen(yearMonth: number) {
  if (!isRioTurnoverMonth(yearMonth)) throw new Error("not_turnover_month");
  const month = await prisma.rioCompMonth.findUnique({ where: { yearMonth } });
  if (!month) throw new Error("month_not_found");
  if (month.closedAt) throw new Error("month_closed");
  return month;
}

/** Zera preparação e grava backup antes da virada. */
export async function viradaPrepareReset(monthId: string) {
  await saveRioPreSyncSnapshot(monthId);
  await prisma.rioCompMonth.update({
    where: { id: monthId },
    data: { viradaPrepare: emptyPrepare() as unknown as Prisma.InputJsonValue },
  });
  await ensureRioSystemGrupos(monthId);
}

/** Acumula uma página da listagem CA (chamar 1, 2, 3… até hasMore=false). */
export async function viradaPrepareCaPage(
  accessToken: string,
  yearMonth: number,
  page: number,
): Promise<{ hasMore: boolean; page: number; activeCount: number }> {
  const month = await assertViradaMonthOpen(yearMonth);
  let prep = parsePrepare(month.viradaPrepare);
  if (!prep) {
    await viradaPrepareReset(month.id);
    prep = emptyPrepare();
  }

  const { items, hasMore, pagina } = await fetchActiveClientePersonPage(accessToken, page);
  const map = { ...prep.summariesById };
  for (const s of items) {
    map[s.id] = { id: s.id, nomeLista: s.nomeLista, documento: s.documento };
  }
  const idSet = new Set(prep.activeIds);
  for (const s of items) idSet.add(s.id);

  const next: ViradaPrepareStored = {
    summariesById: map,
    activeIds: [...idSet],
    caPagesLoaded: Math.max(prep.caPagesLoaded, pagina),
    startedAt: prep.startedAt,
  };

  await prisma.rioCompMonth.update({
    where: { id: month.id },
    data: { viradaPrepare: next as unknown as Prisma.InputJsonValue },
  });

  return { hasMore, page: pagina, activeCount: next.activeIds.length };
}

/** Compara até `limit` linhas existentes com a listagem CA já guardada. */
export async function viradaApplyLinhasBatch(
  accessToken: string,
  yearMonth: number,
  offset: number,
  limit: number,
  options?: SyncRioCompFromCaOptions,
): Promise<{
  processed: number;
  totalLinhas: number;
  hasMore: boolean;
  stats: ViradaStats;
}> {
  const month = await assertViradaMonthOpen(yearMonth);
  const prep = parsePrepare(month.viradaPrepare);
  if (!prep || prep.activeIds.length === 0) {
    throw new Error("virada_prepare_empty");
  }

  const activeIds = new Set(prep.activeIds);
  const systemIds = await ensureRioSystemGrupos(month.id);
  const sysIdSet = new Set(Object.values(systemIds));

  const includePersonDetails = options?.includePersonDetails === true;
  const includeContracts = options?.includeContracts === true;

  const linhasDb = await prisma.rioCompClienteLinha.findMany({
    where: { monthId: month.id },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    skip: offset,
    take: limit,
  });

  const totalLinhas = await prisma.rioCompClienteLinha.count({ where: { monthId: month.id } });

  const stats: ViradaStats = { entrada: 0, saida: 0, estavel: 0, novos: 0 };

  const linkedIds = linhasDb
    .filter((l) => isRioCaPersonLinked(l.caPersonId))
    .map((l) => l.caPersonId);
  const detailMap =
    includePersonDetails && linkedIds.length ?
      await enrichPersonRowsByIdsBatch(accessToken, linkedIds)
    : new Map<string, Record<string, unknown>>();

  for (const l of linhasDb) {
    if (!isRioCaPersonLinked(l.caPersonId)) continue;

    if (activeIds.has(l.caPersonId)) {
      let rioGrupoId = l.rioGrupoId;
      if (rioGrupoId && sysIdSet.has(rioGrupoId)) rioGrupoId = null;

      let patch: {
        movimento: RioClienteCompMovimento;
        rioGrupoId: string | null;
        nomeFantasia?: string;
        razaoSocial?: string;
        documento?: string | null;
        emailCobranca?: string | null;
        valorClienteTexto?: string;
        contratosAtivosTexto?: string;
      } = { movimento: "estavel", rioGrupoId };

      if (includePersonDetails) {
        const raw = detailMap.get(l.caPersonId) ?? {};
        const rec = asRecord(raw) ?? {};
        patch.nomeFantasia = nomeFantasiaFromRaw(rec, l.nomeFantasia).slice(0, 8000);
        patch.razaoSocial = razaoFromRaw(rec, l.razaoSocial).slice(0, 8000);
        patch.documento = documentoFromRaw(rec, l.documento);
        patch.emailCobranca = cobrancaPlusPrincipalEmailsJoined(raw) || l.emailCobranca;
        const contract = await fetchActiveContractSummaryForClient(accessToken, l.caPersonId);
        patch.valorClienteTexto = mergeValorClienteFromContaAzul(
          l.valorClienteTexto,
          contract?.valorTexto,
          valorClienteFromRaw(rec),
        );
        if (contract?.numeros) patch.contratosAtivosTexto = contract.numeros.slice(0, 400);
      } else if (includeContracts) {
        const contract = await fetchActiveContractSummaryForClient(accessToken, l.caPersonId);
        if (contract?.numeros) patch.contratosAtivosTexto = contract.numeros.slice(0, 400);
        patch.valorClienteTexto = mergeValorClienteFromContaAzul(
          l.valorClienteTexto,
          contract?.valorTexto,
          null,
        );
      }

      await prisma.rioCompClienteLinha.update({ where: { id: l.id }, data: patch });
      stats.estavel += 1;
    } else {
      await prisma.rioCompClienteLinha.update({
        where: { id: l.id },
        data: {
          movimento: "saida",
          rioGrupoId: systemIds.ca_saida,
          grupoSite: "",
        },
      });
      stats.saida += 1;
    }
  }

  return {
    processed: linhasDb.length,
    totalLinhas,
    hasMore: offset + linhasDb.length < totalLinhas,
    stats,
  };
}

/** Cria linhas de clientes ativos na CA que ainda não estão na planilha. */
export async function viradaFinalizeNovos(
  accessToken: string,
  yearMonth: number,
  options?: SyncRioCompFromCaOptions,
): Promise<{ novos: number; stats: ViradaStats }> {
  const month = await assertViradaMonthOpen(yearMonth);
  const prep = parsePrepare(month.viradaPrepare);
  if (!prep) throw new Error("virada_prepare_empty");

  const systemIds = await ensureRioSystemGrupos(month.id);
  const includePersonDetails = options?.includePersonDetails === true;
  const includeContracts = options?.includeContracts === true;

  const linhasDb = await prisma.rioCompClienteLinha.findMany({
    where: { monthId: month.id },
    select: { caPersonId: true, sortOrder: true },
  });
  const linkedByCa = new Set<string>();
  for (const l of linhasDb) {
    if (isRioCaPersonLinked(l.caPersonId)) linkedByCa.add(l.caPersonId);
  }

  let sortTail =
    linhasDb.length > 0 ? Math.max(...linhasDb.map((l) => l.sortOrder)) + 1 : 0;

  const stats: ViradaStats = { entrada: 0, saida: 0, estavel: 0, novos: 0 };
  const summaries = Object.values(prep.summariesById) as CaClienteActiveSummary[];

  const newIds = summaries.map((s) => s.id).filter((id) => !linkedByCa.has(id));
  const detailMap =
    includePersonDetails && newIds.length ?
      await enrichPersonRowsByIdsBatch(accessToken, newIds)
    : new Map<string, Record<string, unknown>>();

  for (const s of summaries) {
    if (linkedByCa.has(s.id)) continue;
    const raw = detailMap.get(s.id) ?? {};
    const rec = asRecord(raw) ?? {};
    const email = includePersonDetails ? cobrancaPlusPrincipalEmailsJoined(raw) || null : null;
    let valorClienteTexto = "";
    let contratosAtivosTexto = "";
    if (includePersonDetails || includeContracts) {
      const contract = await fetchActiveContractSummaryForClient(accessToken, s.id);
      if (contract?.numeros) contratosAtivosTexto = contract.numeros.slice(0, 400);
      if (contract?.valorTexto) valorClienteTexto = contract.valorTexto.slice(0, 200);
      else if (includePersonDetails) {
        const v = valorClienteFromRaw(rec);
        if (v) valorClienteTexto = v.slice(0, 200);
      }
    }

    await prisma.rioCompClienteLinha.create({
      data: {
        monthId: month.id,
        caPersonId: s.id,
        rioGrupoId: systemIds.ca_entrada,
        grupoSite: "",
        nomeFantasia: (nomeFantasiaFromRaw(rec, s.nomeLista) || s.nomeLista).slice(0, 8000),
        razaoSocial: razaoFromRaw(rec, s.nomeLista).slice(0, 8000),
        documento: documentoFromRaw(rec, s.documento),
        emailCobranca: email,
        valorClienteTexto,
        contratosAtivosTexto,
        movimento: "entrada",
        sortOrder: sortTail++,
      },
    });
    stats.novos += 1;
    stats.entrada += 1;
  }

  await prisma.rioCompMonth.update({
    where: { id: month.id },
    data: {
      lastSyncedAt: new Date(),
      viradaPrepare: Prisma.DbNull,
    },
  });

  return { novos: stats.novos, stats };
}

export async function hydrateViradaMonth(yearMonth: number) {
  const full = await getRioCompMonthWithLinhas(yearMonth);
  if (!full) throw new Error("hydrate_failed");
  return full;
}
