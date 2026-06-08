import type {
  Prisma,
  RioClienteCompMovimento,
  RioCompClienteLinha,
  RioCompGrupo,
  RioCompMonth,
  RioCompPdv,
} from "@prisma/client";
import { cobrancaPlusPrincipalEmailsJoined } from "@/lib/contaazul/personBilling";
import { fetchActiveContractNumbersByClientIds } from "@/lib/contaazul/contracts";
import { prisma } from "@/lib/prisma";
import { fetchActiveClientePersonSummaries } from "@/lib/contaazul/activeClientesCa";
import type { ParsedRioFileRow } from "@/lib/rio/rioCompFileImport";
import { fallbackCaPersonIdFromDocument } from "@/lib/rio/rioCompFileImport";
import { normalizeBrazilianTaxIdForStorage } from "@/lib/format";
import { parseMarcaPdvLayoutFromBuffer } from "@/lib/rio/rioMarcaPdvCsvLayout";
import { sortRioPdvsByNome } from "@/lib/rio/pdvNames";
import {
  compareRioLinhasByNomeFantasia,
  sortRioCompGruposForDisplay,
} from "@/lib/rio/sortRioCompLinhas";
import { isRioTurnoverMonth } from "@/lib/rio/rioTurnover";
import {
  mergeValorClienteFromContaAzul,
  valorClienteTextoFromPdvUnit,
} from "@/lib/rio/valorClienteCalc";
import { normalizeRioOrigemCliente } from "@/lib/rio/rioOrigemCliente";
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
  return normalizeBrazilianTaxIdForStorage(d || fallback);
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

export type RioCompGrupoDto = Pick<RioCompGrupo, "id" | "nome" | "sortOrder" | "systemTag">;

export type RioCompLinhaOut = RioCompClienteLinha & {
  pdvs: RioCompPdv[];
  grupo?: RioCompGrupoDto | null;
};

function sortClienteLinhasByGrupo(gruposSorted: RioCompGrupo[], raw: RioCompLinhaOut[]) {
  const idx = new Map(gruposSorted.map((g, i) => [g.id, i]));
  return [...raw].sort((a, b) => {
    const ga = a.rioGrupoId ? (idx.get(a.rioGrupoId) ?? 999999) : 999999;
    const gb = b.rioGrupoId ? (idx.get(b.rioGrupoId) ?? 999999) : 999999;
    if (ga !== gb) return ga - gb;
    return compareRioLinhasByNomeFantasia(a, b);
  });
}

/** Liga `rio_grupo_id` usando o texto já guardado em `grupo_site` (import legado ou sync só texto). */
export async function reconcileRioCompGrupoLinks(monthId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await reconcileRioCompGrupoLinksTx(tx, monthId);
  });
}

function normMarcaNome(s: string): string {
  return s.replace(/^\uFEFF/, "").trim();
}

async function needsGrupoLegacyAttach(monthId: string): Promise<boolean> {
  const hit = await prisma.rioCompClienteLinha.findFirst({
    where: {
      monthId,
      rioGrupoId: null,
      NOT: [{ grupoSite: "" }],
    },
    select: { grupoSite: true },
  });
  return Boolean(hit?.grupoSite && normMarcaNome(hit.grupoSite).length > 0);
}

export async function reconcileRioCompGrupoLinksTx(tx: Prisma.TransactionClient, monthId: string) {
  const linhasDb = await tx.rioCompClienteLinha.findMany({
    where: { monthId },
    select: { id: true, grupoSite: true, rioGrupoId: true },
  });

  let gruposExisting = await tx.rioCompGrupo.findMany({
    where: { monthId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const byNome = new Map(gruposExisting.map((g) => [normMarcaNome(g.nome), g]));

  const distinctNome = [
    ...new Set(linhasDb.map((l) => normMarcaNome(l.grupoSite)).filter(Boolean)),
  ];
  distinctNome.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));

  let nextOrder =
    gruposExisting.length ?
      Math.max(...gruposExisting.map((g) => g.sortOrder)) + 1
    : 0;

  for (const nome of distinctNome) {
    let g = byNome.get(nome);
    if (!g) {
      g = await tx.rioCompGrupo.create({
        data: { monthId, nome, sortOrder: nextOrder },
      });
      nextOrder += 1;
      byNome.set(nome, g);
      gruposExisting.push(g);
    }
  }

  /** Só linhas legadas (texto em grupo_site, ainda sem FK) — não apaga escolha manual no dropdown. */
  for (const l of linhasDb) {
    if (l.rioGrupoId) continue;
    const t = normMarcaNome(l.grupoSite);
    if (!t) continue;
    const gid = byNome.get(t)?.id ?? null;
    if (!gid) continue;
    await tx.rioCompClienteLinha.update({
      where: { id: l.id },
      data: { rioGrupoId: gid },
    });
  }
}

async function hydrateMonthBundle(yearMonth: number, depth = 0) {
  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth },
    include: {
      grupos: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      linhas: {
        orderBy: [{ nomeFantasia: "asc" }, { id: "asc" }],
        include: {
          pdvs: { orderBy: [{ nome: "asc" }, { id: "asc" }] },
          rioGrupo: { select: { id: true, nome: true, sortOrder: true, systemTag: true } },
        },
      },
    },
  });
  if (!month) return null;

  if (await needsGrupoLegacyAttach(month.id)) {
    if (depth >= 10) throw new Error("rio_grupo_reconcile_retry_limit");
    await reconcileRioCompGrupoLinks(month.id);
    return hydrateMonthBundle(yearMonth, depth + 1);
  }

  const { grupos: _omitG, linhas: _omitL, ...monthRow } = month;

  const gruposDisplay = sortRioCompGruposForDisplay(month.grupos);
  const gruposBrief: RioCompGrupoDto[] = gruposDisplay.map((g) => ({
    id: g.id,
    nome: g.nome,
    sortOrder: g.sortOrder,
    systemTag: g.systemTag,
  }));

  const baseLinhas = month.linhas.map((ln) => {
    const { rioGrupo, ...rest } = ln;
    const row = rest as RioCompClienteLinha;
    const out: RioCompLinhaOut = {
      ...row,
      documento: normalizeBrazilianTaxIdForStorage(row.documento),
      pdvs: sortRioPdvsByNome(
        ln.pdvs.map((p) => ({
          ...p,
          documento: normalizeBrazilianTaxIdForStorage(p.documento),
        })),
      ),
      grupo: rioGrupo ? { ...rioGrupo } : null,
    };
    return out;
  });
  const linhas = sortClienteLinhasByGrupo(gruposDisplay, baseLinhas);
  return {
    month: monthRow,
    grupos: gruposBrief,
    linhas,
  };
}

export async function getRioCompMonthWithLinhas(yearMonth: number): Promise<{
  month: RioCompMonth;
  grupos: RioCompGrupoDto[];
  linhas: RioCompLinhaOut[];
} | null> {
  return hydrateMonthBundle(yearMonth);
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
  valorPdvUnitarioTexto: string;
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
  /**
   * Se true, chamadas extras `/v1/pessoas?ids=…` para e-mail cobrança, razão social, etc.
   * Com muitos clientes também estoura timeout no Netlify Free (~10s).
   */
  includePersonDetails?: boolean;
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
  grupos: RioCompGrupoDto[];
  linhas: RioCompLinhaOut[];
  caPersonListingCount: number;
  syncedContractsFromCa: boolean;
  syncedPersonDetailsFromCa: boolean;
}> {
  const month = await ensureRioCompMonth(yearMonth);

  const { saveRioPreSyncSnapshot } = await import("@/lib/rio/rioCompSyncSnapshot");
  await saveRioPreSyncSnapshot(month.id);

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
        emailCobranca: r.emailCobranca,
        valorClienteTexto: r.valorClienteTexto,
        valorPdvUnitarioTexto: r.valorPdvUnitarioTexto,
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

  const includePersonDetails = options?.includePersonDetails === true;
  const detailMap = includePersonDetails
    ? await enrichPersonRowsByIdsBatch(
        accessToken,
        summaries.map((s) => s.id),
      )
    : new Map<string, Record<string, unknown>>();

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
    const email = includePersonDetails
      ? (cobrancaPlusPrincipalEmailsJoined(raw) || null)
      : (preserved.get(s.id)?.emailCobranca ?? null);
    const nomeFantasia = nomeFantasiaFromRaw(raw) || s.nomeLista;
    const razao = razaoFromRaw(raw) || nomeFantasia;
    const doc = documentoFromRaw(raw, s.documento);
    const valorPessoaCa = includePersonDetails ? valorClienteFromRaw(raw) : "";
    const prev = preserved.get(s.id);
    const contratos = includeContracts
      ? ((contractsMap.get(s.id) ?? "").trim())
      : (prev?.contratosAtivosTexto ?? "").trim();
    const valorClienteTexto = mergeValorClienteFromContaAzul(
      prev?.valorClienteTexto ?? "",
      null,
      valorPessoaCa,
    );

    drafts.push({
      caPersonId: s.id,
      grupoSite: prev?.grupoSite ?? "",
      nomeFantasia,
      razaoSocial: razao,
      documento: doc,
      emailCobranca: email,
      valorClienteTexto,
      valorPdvUnitarioTexto: prev?.valorPdvUnitarioTexto ?? "",
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
        valorPdvUnitarioTexto: prevPres?.valorPdvUnitarioTexto ?? prevLinha.valorPdvUnitarioTexto,
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

  /** Import/sync grandes: criar cliente-a-cliente dentro da transação interactiva faz o Prisma/Neon expirar → createMany em blocos. */
  const PDV_CREATEMANY_CHUNK = 750;

  await prisma.$transaction(
    async (tx) => {
      await tx.rioCompClienteLinha.deleteMany({ where: { monthId: month.id } });
      await tx.rioCompGrupo.deleteMany({
        where: { monthId: month.id, systemTag: { not: null } },
      });

      await tx.rioCompClienteLinha.createMany({
        data: drafts.map((d, sortOrder) => ({
          monthId: month.id,
          caPersonId: d.caPersonId,
          grupoSite: d.grupoSite,
          nomeFantasia: d.nomeFantasia,
          razaoSocial: d.razaoSocial,
          documento: d.documento,
          emailCobranca: d.emailCobranca,
          valorClienteTexto: d.valorClienteTexto,
          valorPdvUnitarioTexto: d.valorPdvUnitarioTexto,
          numeroPdvSite: d.numeroPdvSite,
          categoriaSite: d.categoriaSite,
          contratosAtivosTexto: d.contratosAtivosTexto,
          movimento: d.movimento,
          observacoesLinha: d.observacoesLinha,
          sortOrder,
        })),
      });

      const createdLinhas = await tx.rioCompClienteLinha.findMany({
        where: { monthId: month.id },
        select: { id: true, caPersonId: true },
      });
      const clienteIdByCa = new Map(
        createdLinhas.map((l) => [l.caPersonId, l.id]),
      );

      const pdvsToInsert: { clienteId: string; nome: string; notes: string; sortOrder: number }[] =
        [];

      for (const d of drafts) {
        const clienteId = clienteIdByCa.get(d.caPersonId);
        if (!clienteId) continue;
        let pi = 0;
        for (const p of d.pdvsSeed) {
          pdvsToInsert.push({
            clienteId,
            nome: p.nome.trim() ? p.nome : `PDV ${pi + 1}`,
            notes: p.notes,
            sortOrder: p.sortOrder ?? pi,
          });
          pi++;
        }
      }

      for (let o = 0; o < pdvsToInsert.length; o += PDV_CREATEMANY_CHUNK) {
        const slice = pdvsToInsert.slice(o, o + PDV_CREATEMANY_CHUNK);
        if (slice.length) await tx.rioCompPdv.createMany({ data: slice });
      }

      await tx.rioCompMonth.update({
        where: { id: month.id },
        data: { lastSyncedAt: new Date() },
      });

      await reconcileRioCompGrupoLinksTx(tx, month.id);
    },
    {
      timeout: 240_000,
      maxWait: 45_000,
    },
  );

  const out = await getRioCompMonthWithLinhas(yearMonth);
  return {
    ...out!,
    caPersonListingCount: summaries.length,
    syncedContractsFromCa: includeContracts,
    syncedPersonDetailsFromCa: includePersonDetails,
  };
}

/**
 * Substitui **todas** as linhas (e PDVs) da competência por dados de ficheiro CSV/xlsx.
 * Não chama a API Conta Azul. Inferência **entrada | estável | saída** (default): iguala ao sync
 * cruzando com o **mês civil anterior** gravado neste portal.
 */
export async function replaceRioCompMonthFromImportedRows(
  yearMonth: number,
  rows: ParsedRioFileRow[],
  options?: { inferMovementVsPriorMonth?: boolean },
): Promise<{ month: RioCompMonth; grupos: RioCompGrupoDto[]; linhas: RioCompLinhaOut[] }> {
  const infer = options?.inferMovementVsPriorMonth !== false;
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
        emailCobranca: r.emailCobranca,
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

  type PdvSeed = { nome: string; notes: string; sortOrder: number };
  type ImportDraft = {
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

  const drafts: ImportDraft[] = [];

  rows.forEach((r, ix) => {
    const cid = r.caPersonId.trim().slice(0, 120);
    const caPersonId = cid.length ? cid : fallbackCaPersonIdFromDocument(r.documento, ix + 2);
    const prevP = preserved.get(caPersonId);
    const mov: RioClienteCompMovimento = infer
      ? !prevMonth
        ? "entrada"
        : prevIds.has(caPersonId)
          ? "estavel"
          : "entrada"
      : r.movimento;

    const grupoSite = r.grupoSite.trim().length ? r.grupoSite : (prevP?.grupoSite ?? "");
    const categoriaSite =
      r.categoriaSite.trim().length ? r.categoriaSite.slice(0, 120) : (prevP?.categoriaSite ?? "");
    const numeroPdvSite = r.numeroPdvSite > 0 ? r.numeroPdvSite : (prevP?.numeroPdvSite ?? 0);
    const valorClienteTexto = r.valorClienteTexto.trim().slice(0, 200);
    const contratosAtivosTexto =
      r.contratosAtivosTexto.trim().length ?
        r.contratosAtivosTexto.slice(0, 400)
      : (prevP?.contratosAtivosTexto ?? "");
    const observacoesLinha =
      r.observacoesLinha.trim().length ? r.observacoesLinha : (prevP?.observacoesLinha ?? "");
    const emailCobranca =
      r.emailCobranca && r.emailCobranca.trim() ?
        r.emailCobranca.trim()
      : (prevP?.emailCobranca ?? null);
    const pdvsSeed = prevP?.pdvs?.length ? prevP.pdvs : [];

    drafts.push({
      caPersonId,
      grupoSite,
      nomeFantasia: r.nomeFantasia,
      razaoSocial: r.razaoSocial,
      documento: r.documento,
      emailCobranca,
      valorClienteTexto,
      numeroPdvSite,
      categoriaSite,
      contratosAtivosTexto,
      movimento: mov,
      observacoesLinha,
      pdvsSeed,
    });
  });

  const activeIds = new Set(drafts.map((d) => d.caPersonId));

  if (infer && prevMonth) {
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

  /** Import grandes: milhares de `create` numa só transação fazem Neon/pool ou o timeout do Prisma fecharem antes do fim → "Transaction not found". */
  const PDV_CREATEMANY_CHUNK = 750;

  await prisma.$transaction(
    async (tx) => {
      await tx.rioCompClienteLinha.deleteMany({ where: { monthId: month.id } });
      await tx.rioCompGrupo.deleteMany({ where: { monthId: month.id } });

      await tx.rioCompClienteLinha.createMany({
        data: drafts.map((d, sortOrder) => ({
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
        })),
      });

      const createdLinhas = await tx.rioCompClienteLinha.findMany({
        where: { monthId: month.id },
        select: { id: true, caPersonId: true },
      });
      const clienteIdByCa = new Map(
        createdLinhas.map((l) => [l.caPersonId, l.id]),
      );

      const pdvsToInsert: { clienteId: string; nome: string; notes: string; sortOrder: number }[] =
        [];

      for (const d of drafts) {
        const clienteId = clienteIdByCa.get(d.caPersonId);
        if (!clienteId) continue;
        let pi = 0;
        for (const p of d.pdvsSeed) {
          pdvsToInsert.push({
            clienteId,
            nome: p.nome.trim() ? p.nome : `PDV ${pi + 1}`,
            notes: p.notes,
            sortOrder: p.sortOrder ?? pi,
          });
          pi++;
        }
      }

      for (let o = 0; o < pdvsToInsert.length; o += PDV_CREATEMANY_CHUNK) {
        const slice = pdvsToInsert.slice(o, o + PDV_CREATEMANY_CHUNK);
        if (slice.length) await tx.rioCompPdv.createMany({ data: slice });
      }

      await tx.rioCompMonth.update({
        where: { id: month.id },
        data: { lastSyncedAt: new Date() },
      });

      await reconcileRioCompGrupoLinksTx(tx, month.id);
    },
    {
      timeout: 180_000,
      maxWait: 30_000,
    },
  );

  const full = await getRioCompMonthWithLinhas(yearMonth);
  if (!full) throw new Error("rio_month_missing_after_import");
  return full;
}

function normNomeMatchKey(s: string): string {
  return s
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Cruza o nome vindo da planilha interna MARCA+PDVs com `nomeFantasia` já guardado (sync/CSV).
 * Não usa CNPJ. Com vários candidatos escolhe o mais próximo em comprimento e regista aviso.
 */
function pickLinhaForMarcaCsvNome(
  nomeCsv: string,
  pool: RioCompLinhaOut[],
  usedIds: Set<string>,
): { linha: RioCompLinhaOut | null; note?: string } {
  const eligible = pool.filter((l) => !usedIds.has(l.id));
  const n = normNomeMatchKey(nomeCsv);
  if (!n) return { linha: null };

  const exactHits = eligible.filter((l) => normNomeMatchKey(l.nomeFantasia) === n);
  if (exactHits.length === 1) return { linha: exactHits[0]! };
  if (exactHits.length > 1) {
    exactHits.sort((a, b) => a.id.localeCompare(b.id));
    return {
      linha: exactHits[0]!,
      note: `várias linhas com o mesmo nome fantasia (${exactHits.length}); usada a primeira por id interno.`,
    };
  }

  const subs = eligible.filter((l) => {
    const lf = normNomeMatchKey(l.nomeFantasia);
    if (!lf) return false;
    if (n.length >= 5 && lf.includes(n)) return true;
    if (lf.length >= 8 && n.includes(lf)) return true;
    return false;
  });

  if (subs.length === 1) return { linha: subs[0]! };
  if (subs.length > 1) {
    subs.sort(
      (a, b) =>
        Math.abs(normNomeMatchKey(a.nomeFantasia).length - n.length) -
        Math.abs(normNomeMatchKey(b.nomeFantasia).length - n.length),
    );
    return {
      linha: subs[0]!,
      note: `vários candidatos por similaridade (${subs.length}); escolhido «${subs[0]!.nomeFantasia}».`,
    };
  }

  return { linha: null };
}

/**
 * Atualiza **apenas** MARCA (`grupo_site`), categoria (col. H), Nº PDVs site e lista de PDVs,
 * cruzando linhas do CSV interno com clientes já existentes na competência.
 * Não altera CNPJ/documento, valor, e-mail, movimento nem contratos.
 */
export async function applyMarcaPdvCsvLayoutToMonth(
  yearMonth: number,
  buffer: Buffer,
  fileName: string,
): Promise<{
  month: RioCompMonth;
  grupos: RioCompGrupoDto[];
  linhas: RioCompLinhaOut[];
  warnings: string[];
  appliedCount: number;
  unmatchedLabels: string[];
}> {
  const parsed = parseMarcaPdvLayoutFromBuffer(buffer, fileName);
  const warningsOut = [...parsed.warnings];

  await ensureRioCompMonth(yearMonth);
  const bundleBefore = await getRioCompMonthWithLinhas(yearMonth);
  if (!bundleBefore) throw new Error("rio_month_bundle_missing_after_ensure");

  if (!parsed.rows.length) {
    return {
      month: bundleBefore.month,
      grupos: bundleBefore.grupos,
      linhas: bundleBefore.linhas,
      warnings: warningsOut,
      appliedCount: 0,
      unmatchedLabels: [],
    };
  }

  if (!bundleBefore.linhas.length) {
    warningsOut.push(
      "Não há clientes nesta competência — sincronize a Conta Azul ou importe o CSV de clientes antes de aplicar o layout MARCA+PDVs.",
    );
    return {
      month: bundleBefore.month,
      grupos: bundleBefore.grupos,
      linhas: bundleBefore.linhas,
      warnings: warningsOut,
      appliedCount: 0,
      unmatchedLabels: parsed.rows.map((r) => r.nomeMatch),
    };
  }

  const usedIds = new Set<string>();
  const unmatchedLabels: string[] = [];
  let appliedCount = 0;
  const monthId = bundleBefore.month.id;
  const pool = bundleBefore.linhas;

  type PrepLayout = {
    clienteId: string;
    marca: string;
    categoriaSite: string;
    numeroPdvSite: number;
    pdvs: Array<{ nome: string; sortOrder: number }>;
  };

  const prepRows: PrepLayout[] = [];

  for (const row of parsed.rows) {
    const { linha, note } = pickLinhaForMarcaCsvNome(row.nomeMatch, pool, usedIds);
    if (!linha) {
      unmatchedLabels.push(row.nomeMatch);
      continue;
    }
    if (note) {
      warningsOut.push(`«${row.nomeMatch}»: ${note}`);
    }
    usedIds.add(linha.id);
    appliedCount += 1;
    prepRows.push({
      clienteId: linha.id,
      marca: normMarcaNome(row.marca),
      categoriaSite: row.categoriaSite,
      numeroPdvSite: row.numeroPdvSite,
      pdvs: row.pdvs,
    });
  }

  /** Uma só transação pesada bem mais curta que N×delete+loop create por cliente (evita P2028 / Neon). createMany cortado em troços. */
  const PDV_LAYOUT_CHUNK = 750;

  await prisma.$transaction(
    async (tx) => {
      if (!prepRows.length) {
        await reconcileRioCompGrupoLinksTx(tx, monthId);
        return;
      }

      const clienteIds = prepRows.map((p) => p.clienteId);
      await tx.rioCompPdv.deleteMany({ where: { clienteId: { in: clienteIds } } });

      const flatPdvs: { clienteId: string; nome: string; notes: string; sortOrder: number }[] = [];
      for (const pr of prepRows) {
        for (let pi = 0; pi < pr.pdvs.length; pi++) {
          const p = pr.pdvs[pi]!;
          flatPdvs.push({
            clienteId: pr.clienteId,
            nome: p.nome.trim() ? p.nome : `PDV ${pi + 1}`,
            notes: "",
            sortOrder: p.sortOrder ?? pi,
          });
        }
      }
      for (let o = 0; o < flatPdvs.length; o += PDV_LAYOUT_CHUNK) {
        const slice = flatPdvs.slice(o, o + PDV_LAYOUT_CHUNK);
        if (slice.length) await tx.rioCompPdv.createMany({ data: slice });
      }

      for (const pr of prepRows) {
        await tx.rioCompClienteLinha.update({
          where: { id: pr.clienteId, monthId },
          data: {
            grupoSite: pr.marca,
            categoriaSite: pr.categoriaSite,
            numeroPdvSite: pr.numeroPdvSite,
          },
        });
      }

      await reconcileRioCompGrupoLinksTx(tx, monthId);
    },
    {
      timeout: 240_000,
      maxWait: 45_000,
    },
  );

  const full = await getRioCompMonthWithLinhas(yearMonth);
  if (!full) throw new Error("rio_month_missing_after_marca_layout");
  return {
    month: full.month,
    grupos: full.grupos,
    linhas: full.linhas,
    warnings: warningsOut,
    appliedCount,
    unmatchedLabels,
  };
}

export async function patchRioCompClienteLinha(
  linhaId: string,
  data: Partial<{
    grupoSite: string;
    rioGrupoId: string | null;
    nomeFantasia: string;
    razaoSocial: string;
    documento: string | null;
    numeroPdvSite: number;
    sortOrder: number;
    categoriaSite: string;
    observacoesLinha: string;
    valorClienteTexto: string;
    valorPdvUnitarioTexto: string;
    origemCliente: string;
  }>,
) {
  const current = await prisma.rioCompClienteLinha.findUnique({
    where: { id: linhaId },
    select: { numeroPdvSite: true, valorPdvUnitarioTexto: true },
  });
  if (!current) throw new Error("line_not_found");

  const payload: typeof data = { ...data };
  const nPdv = payload.numeroPdvSite ?? current.numeroPdvSite;

  if (typeof payload.valorPdvUnitarioTexto === "string") {
    payload.valorPdvUnitarioTexto = payload.valorPdvUnitarioTexto.slice(0, 200);
    const total = valorClienteTextoFromPdvUnit(payload.valorPdvUnitarioTexto, nPdv);
    if (total) payload.valorClienteTexto = total.slice(0, 200);
  } else if (
    typeof payload.numeroPdvSite === "number" &&
    current.valorPdvUnitarioTexto.trim()
  ) {
    const total = valorClienteTextoFromPdvUnit(current.valorPdvUnitarioTexto, nPdv);
    if (total) payload.valorClienteTexto = total.slice(0, 200);
  }

  if (typeof payload.valorClienteTexto === "string") {
    payload.valorClienteTexto = payload.valorClienteTexto.slice(0, 200);
  }

  if (typeof payload.origemCliente === "string") {
    payload.origemCliente = normalizeRioOrigemCliente(payload.origemCliente);
  }

  await prisma.rioCompClienteLinha.update({
    where: { id: linhaId },
    data: payload,
  });
}

export async function createRioCompGrupo(monthId: string, nomeRaw?: string) {
  const nome = (nomeRaw ?? "").trim().slice(0, 600) || "Nova MARCA";
  const agg = await prisma.rioCompGrupo.aggregate({
    where: { monthId },
    _max: { sortOrder: true },
  });
  const sortOrder = (agg._max.sortOrder ?? -1) + 1;
  return prisma.rioCompGrupo.create({
    data: { monthId, nome, sortOrder },
    select: { id: true, nome: true, sortOrder: true },
  });
}

/** Só permite apagar marca vazia (sem cliente associado pelo FK). */
export async function deleteRioCompGrupoIfEmpty(monthId: string, grupoId: string) {
  const g = await prisma.rioCompGrupo.findFirst({
    where: { id: grupoId, monthId },
    select: { id: true, systemTag: true },
  });
  if (!g) throw new Error("grupo_not_found");
  if (g.systemTag) throw new Error("system_grupo_locked");
  const n = await prisma.rioCompClienteLinha.count({
    where: { monthId, rioGrupoId: grupoId },
  });
  if (n > 0) throw new Error("grupo_not_empty");
  await prisma.rioCompGrupo.delete({ where: { id: grupoId } });
}

export async function reorderRioCompGrupos(monthId: string, orderedIds: string[]) {
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i]!;
      const own = await tx.rioCompGrupo.findFirst({ where: { id, monthId } });
      if (!own) continue;
      await tx.rioCompGrupo.update({
        where: { id },
        data: { sortOrder: i },
      });
    }
  });
}

export async function assignClienteLinhasLayout(
  monthId: string,
  items: { id: string; rio_grupo_id: string | null; sort_order: number }[],
) {
  await prisma.$transaction(async (tx) => {
    for (const it of items) {
      const linha = await tx.rioCompClienteLinha.findFirst({
        where: { id: it.id, monthId },
      });
      if (!linha) continue;
      let grupoSite = linha.grupoSite;
      if (it.rio_grupo_id) {
        const g = await tx.rioCompGrupo.findFirst({
          where: { id: it.rio_grupo_id, monthId },
        });
        grupoSite = g?.nome ?? linha.grupoSite;
      } else if (it.rio_grupo_id === null) {
        grupoSite = "";
      }
      await tx.rioCompClienteLinha.update({
        where: { id: linha.id },
        data: {
          rioGrupoId: it.rio_grupo_id,
          sortOrder: it.sort_order,
          grupoSite,
        },
      });
    }
  });
}

export async function reorderRioPdvsForClienteLinha(clienteId: string, orderedPdvIds: string[]) {
  await prisma.$transaction(async (tx) => {
    const pdvs = await tx.rioCompPdv.findMany({
      where: { clienteId },
      select: { id: true },
    });
    const set = new Set(pdvs.map((p) => p.id));
    for (let i = 0; i < orderedPdvIds.length; i++) {
      const pid = orderedPdvIds[i]!;
      if (!set.has(pid)) continue;
      await tx.rioCompPdv.update({
        where: { id: pid },
        data: { sortOrder: i },
      });
    }
  });
}

export async function renameRioCompGrupo(monthId: string, grupoId: string, nomeRaw: string) {
  const nome = nomeRaw.trim().slice(0, 600);
  if (!nome) throw new Error("empty_name");
  const g = await prisma.rioCompGrupo.findFirst({ where: { id: grupoId, monthId } });
  if (!g) throw new Error("grupo_not_found");
  await prisma.$transaction(async (tx) => {
    await tx.rioCompGrupo.update({
      where: { id: grupoId },
      data: { nome },
    });
    await tx.rioCompClienteLinha.updateMany({
      where: { monthId, rioGrupoId: grupoId },
      data: { grupoSite: nome },
    });
  });
}

/** Atualiza `numero_pdv_site` para bater com a quantidade de PDVs cadastrados na linha. */
export async function syncRioCompNumeroPdvSiteFromPdvs(linhaId: string): Promise<number> {
  const linha = await prisma.rioCompClienteLinha.findUnique({
    where: { id: linhaId },
    select: { valorPdvUnitarioTexto: true, month: { select: { yearMonth: true } } },
  });
  const countWhere =
    linha?.month && isRioTurnoverMonth(linha.month.yearMonth) ?
      { clienteId: linhaId, movimento: { not: "saida" as const } }
    : { clienteId: linhaId };
  const count = await prisma.rioCompPdv.count({ where: countWhere });
  /** Sem PDVs internos na linha, mantém 1 no Nº PDV (faturamento / valor por PDV). */
  const numeroPdvSite = Math.max(count, 1);
  const valorClienteTexto =
    linha?.valorPdvUnitarioTexto.trim() ?
      valorClienteTextoFromPdvUnit(linha.valorPdvUnitarioTexto, numeroPdvSite)
    : undefined;
  await prisma.rioCompClienteLinha.update({
    where: { id: linhaId },
    data: {
      numeroPdvSite,
      ...(valorClienteTexto !== undefined ? { valorClienteTexto: valorClienteTexto.slice(0, 200) } : {}),
    },
  });
  return numeroPdvSite;
}

/** Remove cliente e PDVs da competência (não apaga na Conta Azul). */
export async function deleteRioCompClienteLinha(linhaId: string, monthId: string) {
  const linha = await prisma.rioCompClienteLinha.findFirst({
    where: { id: linhaId, monthId },
    select: { id: true, month: { select: { closedAt: true } } },
  });
  if (!linha) throw new Error("line_not_found");
  if (linha.month.closedAt) throw new Error("month_closed");
  await prisma.rioCompClienteLinha.delete({ where: { id: linhaId } });
}

/** Linha manual na competência (sem CA); depois vincular com «Vincular CA». */
export async function createRioCompClienteLinha(
  monthId: string,
  input?: {
    nomeFantasia?: string;
    documento?: string | null;
    rioGrupoId?: string | null;
  },
): Promise<RioCompLinhaOut> {
  const month = await prisma.rioCompMonth.findUnique({
    where: { id: monthId },
    select: { id: true, yearMonth: true, closedAt: true },
  });
  if (!month) throw new Error("month_not_found");
  if (month.closedAt) throw new Error("month_closed");

  let rioGrupoId: string | null = input?.rioGrupoId?.trim() || null;
  let grupoSite = "";
  if (rioGrupoId) {
    const g = await prisma.rioCompGrupo.findFirst({
      where: { id: rioGrupoId, monthId },
      select: { id: true, nome: true, systemTag: true },
    });
    if (!g || g.systemTag) throw new Error("grupo_not_found");
    grupoSite = g.nome;
  } else {
    rioGrupoId = null;
  }

  const nomeFantasia = (input?.nomeFantasia?.trim() || "Novo cliente").slice(0, 8000);
  const documento = normalizeBrazilianTaxIdForStorage(
    input?.documento != null ? String(input.documento) : null,
  );

  const maxSort = await prisma.rioCompClienteLinha.aggregate({
    where: { monthId },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  const created = await prisma.rioCompClienteLinha.create({
    data: {
      monthId,
      rioGrupoId,
      grupoSite,
      caPersonId: "pending",
      nomeFantasia,
      razaoSocial: nomeFantasia,
      documento,
      numeroPdvSite: 1,
      movimento: isRioTurnoverMonth(month.yearMonth) ? "entrada" : "estavel",
      sortOrder,
    },
  });

  await prisma.rioCompClienteLinha.update({
    where: { id: created.id },
    data: { caPersonId: `import:unlinked:${created.id}` },
  });

  const full = await getRioCompMonthWithLinhas(month.yearMonth);
  const out = full?.linhas.find((l) => l.id === created.id);
  if (!out) throw new Error("hydrate_failed");
  return out;
}

export async function createRioCompPdv(linhaId: string, nome: string) {
  const linha = await prisma.rioCompClienteLinha.findUnique({
    where: { id: linhaId },
    select: { month: { select: { yearMonth: true, closedAt: true } } },
  });
  if (linha?.month?.closedAt) throw new Error("month_closed");

  const turnover = linha?.month && isRioTurnoverMonth(linha.month.yearMonth);
  const n = await prisma.rioCompPdv.count({
    where:
      turnover ?
        { clienteId: linhaId, movimento: { not: "saida" } }
      : { clienteId: linhaId },
  });
  const pdv = await prisma.rioCompPdv.create({
    data: {
      clienteId: linhaId,
      nome: nome.trim() || `PDV ${n + 1}`,
      sortOrder: n,
      movimento: turnover ? "entrada" : "estavel",
    },
  });
  const numeroPdvSite = await syncRioCompNumeroPdvSiteFromPdvs(linhaId);
  return { pdv, numeroPdvSite };
}

export type RioPdvBulkRow = { nome: string; documento?: string | null };

/** Um PDV por linha; reativa «saída», atualiza CNPJ e ignora só duplicata idêntica. */
export async function createRioCompPdvsBulk(
  linhaId: string,
  rowsRaw: RioPdvBulkRow[],
): Promise<{ created: RioCompPdv[]; updated: RioCompPdv[]; skipped: number; numeroPdvSite: number }> {
  const linha = await prisma.rioCompClienteLinha.findUnique({
    where: { id: linhaId },
    select: { month: { select: { yearMonth: true, closedAt: true } } },
  });
  if (linha?.month?.closedAt) throw new Error("month_closed");
  const turnover = linha?.month && isRioTurnoverMonth(linha.month.yearMonth);
  const movNovo = turnover ? ("entrada" as const) : ("estavel" as const);

  const rows: RioPdvBulkRow[] = [];
  const seen = new Set<string>();
  for (const raw of rowsRaw) {
    const nome = raw.nome.trim();
    if (!nome) continue;
    const key = nome.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      nome,
      documento: normalizeBrazilianTaxIdForStorage(raw.documento),
    });
  }

  const existing = await prisma.rioCompPdv.findMany({
    where: { clienteId: linhaId },
    select: { id: true, nome: true, documento: true, movimento: true, sortOrder: true },
    orderBy: [{ sortOrder: "desc" }, { id: "desc" }],
  });

  const activeByNome = new Map<string, (typeof existing)[number]>();
  const saidaByNome = new Map<string, (typeof existing)[number]>();
  for (const e of existing) {
    const key = e.nome.trim().toLowerCase();
    if (e.movimento === "saida") {
      if (!saidaByNome.has(key)) saidaByNome.set(key, e);
    } else if (!activeByNome.has(key)) {
      activeByNome.set(key, e);
    }
  }

  let order = (existing[0]?.sortOrder ?? -1) + 1;
  const created: RioCompPdv[] = [];
  const updated: RioCompPdv[] = [];
  let skipped = 0;

  for (const row of rows) {
    const key = row.nome.toLowerCase();
    const active = activeByNome.get(key);
    if (active) {
      const nextDoc = row.documento ?? null;
      const curDoc = active.documento ?? null;
      if (nextDoc && nextDoc !== curDoc) {
        const p = await prisma.rioCompPdv.update({
          where: { id: active.id },
          data: { documento: nextDoc },
        });
        updated.push(p);
      } else {
        skipped += 1;
      }
      continue;
    }

    const saida = saidaByNome.get(key);
    if (saida) {
      const p = await prisma.rioCompPdv.update({
        where: { id: saida.id },
        data: {
          movimento: movNovo,
          nome: row.nome.slice(0, 500),
          documento: row.documento ?? saida.documento,
        },
      });
      updated.push(p);
      activeByNome.set(key, p);
      saidaByNome.delete(key);
      continue;
    }

    const p = await prisma.rioCompPdv.create({
      data: {
        clienteId: linhaId,
        nome: row.nome.slice(0, 500),
        documento: row.documento,
        sortOrder: order,
        movimento: movNovo,
      },
    });
    order += 1;
    activeByNome.set(key, p);
    created.push(p);
  }

  const numeroPdvSite = await syncRioCompNumeroPdvSiteFromPdvs(linhaId);
  return { created, updated, skipped, numeroPdvSite };
}

export async function patchRioCompPdv(
  pdvId: string,
  data: Partial<{ nome: string; documento: string | null; notes: string; sortOrder: number }>,
) {
  const patch: Partial<{ nome: string; documento: string | null; notes: string; sortOrder: number }> =
    { ...data };
  if ("documento" in data) {
    patch.documento = normalizeBrazilianTaxIdForStorage(data.documento);
  }
  await prisma.rioCompPdv.update({ where: { id: pdvId }, data: patch });
}

export async function deleteRioCompPdv(pdvId: string) {
  const row = await prisma.rioCompPdv.findUnique({
    where: { id: pdvId },
    select: {
      clienteId: true,
      cliente: { select: { month: { select: { yearMonth: true, closedAt: true } } } },
    },
  });
  if (!row) return null;
  if (row.cliente.month.closedAt) throw new Error("month_closed");

  const turnover = isRioTurnoverMonth(row.cliente.month.yearMonth);
  if (turnover) {
    await prisma.rioCompPdv.update({
      where: { id: pdvId },
      data: { movimento: "saida" },
    });
  } else {
    await prisma.rioCompPdv.delete({ where: { id: pdvId } });
  }
  const numeroPdvSite = await syncRioCompNumeroPdvSiteFromPdvs(row.clienteId);
  return { clienteId: row.clienteId, numeroPdvSite };
}
