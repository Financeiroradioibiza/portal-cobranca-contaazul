import type { RioClienteCompMovimento, RioCompClienteLinha, RioCompPdv, RioCompMonth } from "@prisma/client";
import { cobrancaPlusPrincipalEmailsJoined } from "@/lib/contaazul/personBilling";
import { fetchActiveContractNumbersByClientIds } from "@/lib/contaazul/contracts";
import { prisma } from "@/lib/prisma";
import { fetchActiveClientePersonSummaries } from "@/lib/contaazul/activeClientesCa";
import { shiftYearMonth } from "@/lib/manualReminders/yearMonth";
import { caFetch } from "@/lib/contaazul/caHttp";

function asRecord(o: unknown): Record<string, unknown> | null {
  return typeof o === "object" && o !== null && !Array.isArray(o)
    ? (o as Record<string, unknown>)
    : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Detalha pessoas em lotes pelo parâmetro `ids` repetido na listagem oficial. */
export async function enrichPersonRowsByIdsBatch(
  accessToken: string,
  ids: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const unique = [...new Set(ids)].filter(Boolean);
  const map = new Map<string, Record<string, unknown>>();
  const batchSize = 40;
  const parallel = 4;

  for (let off = 0; off < unique.length; off += batchSize * parallel) {
    const group: string[][] = [];
    for (let g = 0; g < parallel; g++) {
      const slice = unique.slice(off + g * batchSize, off + (g + 1) * batchSize);
      if (slice.length) group.push(slice);
    }
    await Promise.all(
      group.map(async (batch) => {
        const qs = new URLSearchParams();
        qs.set("pagina", "1");
        qs.set("tamanho_pagina", "1000");
        for (const id of batch) qs.append("ids", id);
        try {
          const raw = await caFetch<unknown>(`/v1/pessoas?${qs}`, accessToken);
          const env = asRecord(raw);
          const items = (env?.items ?? env?.itens ?? []) as unknown[];
          if (!Array.isArray(items)) return;
          for (const it of items) {
            const row = asRecord(it);
            const id = str(row?.id);
            if (id) map.set(id, row!);
          }
        } catch {
          /* parcial */
        }
      }),
    );
  }
  return map;
}

function nomeFantasiaFromRaw(row: Record<string, unknown>): string {
  return (
    str(row.nome_fantasia) ||
    str(row.nomeFantasia) ||
    str(row.nome) ||
    str(row.name) ||
    ""
  );
}

function razaoFromRaw(row: Record<string, unknown>): string {
  return str(row.razao_social) || str(row.razaoSocial) || "";
}

function documentoFromRaw(row: Record<string, unknown>, fallback: string | null): string | null {
  const d = str(row.documento) || str(row.cnpj) || str(row.cpf);
  if (d) return d.slice(0, 64);
  return fallback;
}

/** Heurística leve — preenchemos quando a API expuser campos numéricos conhecidos. */
function valorClienteFromRaw(row: Record<string, unknown>): string {
  const keys = [
    "valor_mensal",
    "valorMensal",
    "limite_credito",
    "limiteCredito",
    "capital_social",
    "capitalSocial",
  ] as const;
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 200);
  }
  return "";
}

export async function ensureRioCompMonth(yearMonth: number): Promise<RioCompMonth> {
  const found = await prisma.rioCompMonth.findUnique({ where: { yearMonth } });
  if (found) return found;
  return prisma.rioCompMonth.create({ data: { yearMonth } });
}

export type RioCompLinhaOut = RioCompClienteLinha & { pdvs: RioCompPdv[] };

export async function getRioCompMonthWithLinhas(
  yearMonth: number,
): Promise<{ month: RioCompMonth; linhas: RioCompLinhaOut[] } | null> {
  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth },
    include: {
      linhas: { include: { pdvs: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } },
    },
  });
  if (!month) return null;
  const linhas = [...month.linhas].sort((a, b) => {
    const d = a.sortOrder - b.sortOrder;
    return d !== 0 ? d : a.nomeFantasia.localeCompare(b.nomeFantasia, "pt-BR");
  });
  return { month, linhas };
}

export async function listRioCompMonths(): Promise<Array<{ id: string; yearMonth: number }>> {
  return prisma.rioCompMonth.findMany({
    select: { id: true, yearMonth: true },
    orderBy: { yearMonth: "desc" },
  });
}

type PdvSeed = { nome: string; notes: string; sortOrder: number };

type LinhaUpsertDraft = {
  caPersonId: string;
  grupoSite: string;
  nomeFantasia: string;
  razaoSocial: string;
  documento: string | null;
  emailCobranca: string | null;
  valorClienteTexto: string;
  numeroPdvSite: number;
  categoriaSite: string;
  contratosAtivosTexto: string;
  movimento: RioClienteCompMovimento;
  observacoesLinha: string;
  pdvsSeed: PdvSeed[];
};

export type SyncRioCompFromCaOptions = {
  /**
   * Se true, chama `/v1/contratos` por cliente (muito pesado — costuma cortar antes de responder no Netlify).
   * Com false, repete números de contrato já guardados nesta competência quando existiam.
   */
  includeContracts?: boolean;
};

/**
 * Lista clientes **ativos perfil Cliente** na CA, atualiza snapshots e marca entrada/saida
 * comparando com as linhas já guardadas para o competência **mês civil anterior**.
 */
export async function syncRioCompMonthFromContaAzul(
  accessToken: string,
  yearMonth: number,
  options?: SyncRioCompFromCaOptions,
): Promise<{
  month: RioCompMonth;
  linhas: RioCompLinhaOut[];
  caPersonListingCount: number;
  syncedContractsFromCa: boolean;
}> {
  const month = await ensureRioCompMonth(yearMonth);

  const existingRows = await prisma.rioCompClienteLinha.findMany({
    where: { monthId: month.id },
    include: { pdvs: true },
  });
  const preserved = new Map(
    existingRows.map((r) => [
      r.caPersonId,
      {
        grupoSite: r.grupoSite,
        numeroPdvSite: r.numeroPdvSite,
        categoriaSite: r.categoriaSite,
        observacoesLinha: r.observacoesLinha,
        contratosAtivosTexto: r.contratosAtivosTexto,
        pdvs: r.pdvs.map((p) => ({ nome: p.nome, notes: p.notes, sortOrder: p.sortOrder })),
      },
    ]),
  );

  const prevYm = shiftYearMonth(yearMonth, -1);
  const prevMonth = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: prevYm },
    include: { linhas: { include: { pdvs: true } } },
  });
  const prevIds = new Set((prevMonth?.linhas ?? []).map((x) => x.caPersonId));

  const summaries = await fetchActiveClientePersonSummaries(accessToken);
  const activeIds = new Set(summaries.map((s) => s.id));

  const detailMap = await enrichPersonRowsByIdsBatch(
    accessToken,
    summaries.map((s) => s.id),
  );

  const includeContracts = options?.includeContracts === true;
  const contractsMap = includeContracts
    ? await fetchActiveContractNumbersByClientIds(accessToken, summaries.map((s) => s.id), {
        includeTodosSupplement: false,
        clientConcurrency: 6,
      })
    : new Map<string, string>();

  const drafts: LinhaUpsertDraft[] = [];

  const movimentoForActive = (id: string): RioClienteCompMovimento => {
    if (!prevMonth) return "entrada";
    return prevIds.has(id) ? "estavel" : "entrada";
  };

  for (const s of summaries) {
    const raw = detailMap.get(s.id) ?? {};
    const email = cobrancaPlusPrincipalEmailsJoined(raw) || null;
    const nomeFantasia = nomeFantasiaFromRaw(raw) || s.nomeLista;
    const razao = razaoFromRaw(raw) || nomeFantasia;
    const doc = documentoFromRaw(raw, s.documento);
    const valor = valorClienteFromRaw(raw);
    const prev = preserved.get(s.id);
    const contratos = includeContracts
      ? ((contractsMap.get(s.id) ?? "").trim())
      : (prev?.contratosAtivosTexto ?? "").trim();

    drafts.push({
      caPersonId: s.id,
      grupoSite: prev?.grupoSite ?? "",
      nomeFantasia,
      razaoSocial: razao,
      documento: doc,
      emailCobranca: email,
      valorClienteTexto: valor,
      numeroPdvSite: prev?.numeroPdvSite ?? 0,
      categoriaSite: prev?.categoriaSite ?? "",
      contratosAtivosTexto: contratos,
      movimento: movimentoForActive(s.id),
      observacoesLinha: prev?.observacoesLinha ?? "",
      pdvsSeed: prev?.pdvs?.length ? prev.pdvs : [],
    });
  }

  if (prevMonth) {
    for (const prevLinha of prevMonth.linhas) {
      if (activeIds.has(prevLinha.caPersonId)) continue;
      const prevPres = preserved.get(prevLinha.caPersonId);
      drafts.push({
        caPersonId: prevLinha.caPersonId,
        grupoSite: prevPres?.grupoSite ?? prevLinha.grupoSite,
        nomeFantasia: prevLinha.nomeFantasia,
        razaoSocial: prevLinha.razaoSocial,
        documento: prevLinha.documento,
        emailCobranca: prevLinha.emailCobranca,
        valorClienteTexto: prevLinha.valorClienteTexto,
        numeroPdvSite: prevPres?.numeroPdvSite ?? prevLinha.numeroPdvSite,
        categoriaSite: prevPres?.categoriaSite ?? prevLinha.categoriaSite,
        contratosAtivosTexto: "",
        movimento: "saida",
        observacoesLinha: prevPres?.observacoesLinha ?? prevLinha.observacoesLinha,
        pdvsSeed:
          prevPres?.pdvs?.length ?
            prevPres.pdvs
          : prevLinha.pdvs.map((p) => ({
              nome: p.nome,
              notes: p.notes,
              sortOrder: p.sortOrder,
            })),
      });
    }
  }

  drafts.sort((a, b) =>
    a.nomeFantasia.localeCompare(b.nomeFantasia, "pt-BR", { sensitivity: "base" }),
  );

  let sortOrder = 0;
  await prisma.$transaction(async (tx) => {
    await tx.rioCompClienteLinha.deleteMany({ where: { monthId: month.id } });
    for (const d of drafts) {
      const created = await tx.rioCompClienteLinha.create({
        data: {
          monthId: month.id,
          caPersonId: d.caPersonId,
          grupoSite: d.grupoSite,
          nomeFantasia: d.nomeFantasia,
          razaoSocial: d.razaoSocial,
          documento: d.documento,
          emailCobranca: d.emailCobranca,
          valorClienteTexto: d.valorClienteTexto,
          numeroPdvSite: d.numeroPdvSite,
          categoriaSite: d.categoriaSite,
          contratosAtivosTexto: d.contratosAtivosTexto,
          movimento: d.movimento,
          observacoesLinha: d.observacoesLinha,
          sortOrder,
        },
      });
      sortOrder += 1;
      let pi = 0;
      for (const p of d.pdvsSeed) {
        await tx.rioCompPdv.create({
          data: {
            clienteId: created.id,
            nome: p.nome.trim() ? p.nome : `PDV ${pi + 1}`,
            notes: p.notes,
            sortOrder: p.sortOrder || pi,
          },
        });
        pi++;
      }
    }
    await tx.rioCompMonth.update({
      where: { id: month.id },
      data: { lastSyncedAt: new Date() },
    });
  });

  const out = await getRioCompMonthWithLinhas(yearMonth);
  return { ...out!, caPersonListingCount: summaries.length, syncedContractsFromCa: includeContracts };
}

export async function patchRioCompClienteLinha(
  linhaId: string,
  data: Partial<{
    grupoSite: string;
    numeroPdvSite: number;
    categoriaSite: string;
    observacoesLinha: string;
  }>,
) {
  await prisma.rioCompClienteLinha.update({
    where: { id: linhaId },
    data,
  });
}

export async function createRioCompPdv(linhaId: string, nome: string) {
  const n = await prisma.rioCompPdv.count({ where: { clienteId: linhaId } });
  return prisma.rioCompPdv.create({
    data: { clienteId: linhaId, nome: nome.trim() || `PDV ${n + 1}`, sortOrder: n },
  });
}

export async function patchRioCompPdv(
  pdvId: string,
  data: Partial<{ nome: string; notes: string; sortOrder: number }>,
) {
  await prisma.rioCompPdv.update({ where: { id: pdvId }, data });
}

export async function deleteRioCompPdv(pdvId: string) {
  await prisma.rioCompPdv.delete({ where: { id: pdvId } });
}
