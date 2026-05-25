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
import { parseMarcaPdvLayoutFromBuffer } from "@/lib/rio/rioMarcaPdvCsvLayout";
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

export type RioCompGrupoDto = Pick<RioCompGrupo, "id" | "nome" | "sortOrder">;

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
    const sd = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    return sd !== 0 ? sd : a.nomeFantasia.localeCompare(b.nomeFantasia, "pt-BR", { sensitivity: "base" });
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
    select: { id: true, grupoSite: true },
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

  for (const l of linhasDb) {
    const t = normMarcaNome(l.grupoSite);
    await tx.rioCompClienteLinha.update({
      where: { id: l.id },
      data: { rioGrupoId: t ? (byNome.get(t)?.id ?? null) : null },
    });
  }
}

async function hydrateMonthBundle(yearMonth: number, depth = 0) {
  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth },
    include: {
      grupos: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      linhas: {
        include: {
          pdvs: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
          rioGrupo: { select: { id: true, nome: true, sortOrder: true } },
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

  const gruposBrief: RioCompGrupoDto[] = month.grupos.map((g) => ({
    id: g.id,
    nome: g.nome,
    sortOrder: g.sortOrder,
  }));

  const baseLinhas = month.linhas.map((ln) => {
    const { rioGrupo, ...rest } = ln;
    const out: RioCompLinhaOut = {
      ...(rest as RioCompClienteLinha),
      pdvs: ln.pdvs,
      grupo: rioGrupo ? { ...rioGrupo } : null,
    };
    return out;
  });
  const linhas = sortClienteLinhasByGrupo(month.grupos, baseLinhas);
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
    await tx.rioCompGrupo.deleteMany({ where: { monthId: month.id } });
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
            sortOrder: p.sortOrder ?? pi,
          },
        });
        pi++;
      }
    }
    await tx.rioCompMonth.update({
      where: { id: month.id },
      data: { lastSyncedAt: new Date() },
    });
    await reconcileRioCompGrupoLinksTx(tx, month.id);
  });

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

  await prisma.$transaction(
    async (tx) => {
      for (const row of parsed.rows) {
        const { linha, note } = pickLinhaForMarcaCsvNome(row.nomeMatch, pool, usedIds);
        if (!linha) {
          unmatchedLabels.push(row.nomeMatch);
          continue;
        }
        if (note) {
          warningsOut.push(`«${row.nomeMatch}»: ${note}`);
        }

        const marca = normMarcaNome(row.marca);
        await tx.rioCompClienteLinha.update({
          where: { id: linha.id, monthId },
          data: {
            grupoSite: marca,
            categoriaSite: row.categoriaSite,
            numeroPdvSite: row.numeroPdvSite,
          },
        });

        await tx.rioCompPdv.deleteMany({ where: { clienteId: linha.id } });

        for (let pi = 0; pi < row.pdvs.length; pi++) {
          const p = row.pdvs[pi]!;
          await tx.rioCompPdv.create({
            data: {
              clienteId: linha.id,
              nome: p.nome.trim() ? p.nome : `PDV ${pi + 1}`,
              notes: "",
              sortOrder: p.sortOrder ?? pi,
            },
          });
        }

        usedIds.add(linha.id);
        appliedCount += 1;
      }

      await reconcileRioCompGrupoLinksTx(tx, monthId);
    },
    {
      timeout: 120_000,
      maxWait: 25_000,
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
    numeroPdvSite: number;
    sortOrder: number;
    categoriaSite: string;
    observacoesLinha: string;
  }>,
) {
  const payload = { ...data };
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
    select: { id: true },
  });
  if (!g) throw new Error("grupo_not_found");
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
