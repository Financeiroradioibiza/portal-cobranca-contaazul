import type { RioClienteCompMovimento } from "@prisma/client";
import { fetchActiveClientePersonSummaries } from "@/lib/contaazul/activeClientesCa";
import { fetchActiveContractSummaryForClient } from "@/lib/contaazul/contracts";
import { cobrancaPlusPrincipalEmailsJoined } from "@/lib/contaazul/personBilling";
import { normalizeBrazilianTaxIdForStorage } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { isRioCaPersonLinked } from "@/lib/rio/rioCaPersonLink";
import {
  enrichPersonRowsByIdsBatch,
  getRioCompMonthWithLinhas,
  type RioCompGrupoDto,
  type RioCompLinhaOut,
  type SyncRioCompFromCaOptions,
} from "@/lib/rio/rioClienteCompService";
import {
  RIO_SYSTEM_GRUPOS,
  type RioSystemGrupoTag,
  isRioSystemGrupoTag,
  isRioTurnoverMonth,
} from "@/lib/rio/rioTurnover";

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

export async function ensureRioSystemGrupos(monthId: string): Promise<Record<RioSystemGrupoTag, string>> {
  const existing = await prisma.rioCompGrupo.findMany({
    where: { monthId, systemTag: { not: null } },
    select: { id: true, systemTag: true },
  });
  const out = {} as Record<RioSystemGrupoTag, string>;
  for (const g of existing) {
    if (g.systemTag && isRioSystemGrupoTag(g.systemTag)) {
      out[g.systemTag] = g.id;
    }
  }
  for (const spec of RIO_SYSTEM_GRUPOS) {
    if (out[spec.tag]) continue;
    const created = await prisma.rioCompGrupo.create({
      data: {
        monthId,
        nome: spec.nome,
        sortOrder: spec.sortOrder,
        systemTag: spec.tag,
      },
    });
    out[spec.tag] = created.id;
  }
  return out;
}

export type ViradaStats = {
  entrada: number;
  saida: number;
  estavel: number;
  novos: number;
};

/**
 * Virada do mês: mantém o trabalho clonado, compara com clientes ativos na CA e
 * distribui em blocos entrada/saída/estável (sem apagar a competência).
 */
export async function viradaRioCompMonthFromContaAzul(
  accessToken: string,
  yearMonth: number,
  options?: SyncRioCompFromCaOptions,
): Promise<{
  grupos: RioCompGrupoDto[];
  linhas: RioCompLinhaOut[];
  caPersonListingCount: number;
  viradaStats: ViradaStats;
  syncedContractsFromCa: boolean;
  syncedPersonDetailsFromCa: boolean;
}> {
  if (!isRioTurnoverMonth(yearMonth)) {
    throw new Error("not_turnover_month");
  }

  const month = await prisma.rioCompMonth.findUnique({ where: { yearMonth } });
  if (!month) throw new Error("month_not_found");
  if (month.closedAt) throw new Error("month_closed");

  const { saveRioPreSyncSnapshot } = await import("@/lib/rio/rioCompSyncSnapshot");
  await saveRioPreSyncSnapshot(month.id);

  const systemIds = await ensureRioSystemGrupos(month.id);
  const summaries = await fetchActiveClientePersonSummaries(accessToken);
  const activeIds = new Set(summaries.map((s) => s.id));

  const includePersonDetails = options?.includePersonDetails === true;
  const detailMap = includePersonDetails
    ? await enrichPersonRowsByIdsBatch(
        accessToken,
        summaries.map((s) => s.id),
      )
    : new Map<string, Record<string, unknown>>();

  const includeContracts = options?.includeContracts === true;

  const linhasDb = await prisma.rioCompClienteLinha.findMany({
    where: { monthId: month.id },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const linkedByCa = new Map<string, (typeof linhasDb)[0]>();
  for (const l of linhasDb) {
    if (isRioCaPersonLinked(l.caPersonId)) linkedByCa.set(l.caPersonId, l);
  }

  const stats: ViradaStats = { entrada: 0, saida: 0, estavel: 0, novos: 0 };

  for (const l of linhasDb) {
    if (!isRioCaPersonLinked(l.caPersonId)) continue;

    if (activeIds.has(l.caPersonId)) {
      const sysIds = new Set(Object.values(systemIds));
      let rioGrupoId = l.rioGrupoId;
      if (rioGrupoId && sysIds.has(rioGrupoId)) rioGrupoId = null;

      let patch: {
        movimento: RioClienteCompMovimento;
        rioGrupoId: string | null;
        nomeFantasia?: string;
        razaoSocial?: string;
        documento?: string | null;
        emailCobranca?: string | null;
        valorClienteTexto?: string;
        contratosAtivosTexto?: string;
      } = {
        movimento: "estavel",
        rioGrupoId,
      };

      if (includePersonDetails) {
        const raw = detailMap.get(l.caPersonId) ?? {};
        const rec = asRecord(raw) ?? {};
        patch.nomeFantasia = nomeFantasiaFromRaw(rec, l.nomeFantasia).slice(0, 8000);
        patch.razaoSocial = razaoFromRaw(rec, l.razaoSocial).slice(0, 8000);
        patch.documento = documentoFromRaw(rec, l.documento);
        patch.emailCobranca = cobrancaPlusPrincipalEmailsJoined(raw) || l.emailCobranca;
        const contract = await fetchActiveContractSummaryForClient(accessToken, l.caPersonId);
        if (contract?.valorTexto) {
          patch.valorClienteTexto = contract.valorTexto.slice(0, 200);
        } else {
          const v = valorClienteFromRaw(rec);
          if (v) patch.valorClienteTexto = v.slice(0, 200);
        }
        if (contract?.numeros) patch.contratosAtivosTexto = contract.numeros.slice(0, 400);
      } else if (includeContracts) {
        const contract = await fetchActiveContractSummaryForClient(accessToken, l.caPersonId);
        if (contract?.numeros) patch.contratosAtivosTexto = contract.numeros.slice(0, 400);
        if (contract?.valorTexto) patch.valorClienteTexto = contract.valorTexto.slice(0, 200);
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

  let sortTail =
    linhasDb.length > 0 ? Math.max(...linhasDb.map((l) => l.sortOrder)) + 1 : 0;

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
    data: { lastSyncedAt: new Date() },
  });

  const full = await getRioCompMonthWithLinhas(yearMonth);
  if (!full) throw new Error("hydrate_failed");

  return {
    grupos: full.grupos,
    linhas: full.linhas,
    caPersonListingCount: summaries.length,
    viradaStats: stats,
    syncedContractsFromCa: includeContracts,
    syncedPersonDetailsFromCa: includePersonDetails,
  };
}
