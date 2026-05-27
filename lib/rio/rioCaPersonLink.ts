import { prisma } from "@/lib/prisma";
import { fetchActiveContractSummaryForClient } from "@/lib/contaazul/contracts";
import { billingEmailJoined, fetchPersonDetail, searchPeopleByText } from "@/lib/contaazul/personBilling";
import { sortRioPdvsByNome } from "@/lib/rio/pdvNames";
import {
  syncRioCompNumeroPdvSiteFromPdvs,
  type RioCompLinhaOut,
} from "@/lib/rio/rioClienteCompService";

function asRecord(o: unknown): Record<string, unknown> | null {
  return typeof o === "object" && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Nome fantasia como na Conta Azul (detalhe ou listagem). */
function nomeFantasiaFromCaRaw(
  row: Record<string, unknown>,
  nomeListaFallback?: string,
): string {
  return (
    str(row.nome_fantasia) ||
    str(row.nomeFantasia) ||
    str(row.nome) ||
    str(row.name) ||
    (nomeListaFallback?.trim() ?? "") ||
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

/** UUID real da CA — não placeholder `import:…` do CSV sem vínculo. */
export function isRioCaPersonLinked(caPersonId: string): boolean {
  const t = caPersonId.trim();
  if (!t) return false;
  return !t.startsWith("import:");
}

export function rioCaUnlinkedPersonId(linhaId: string): string {
  return `import:unlinked:${linhaId}`;
}

/** Tamanho de cada lote ao atualizar vínculos CA (evita timeout no Netlify). */
export const RIO_CA_REFRESH_BATCH_SIZE = 10;

export type RioCaLinhaRefreshOptions = {
  includePersonDetails?: boolean;
  includeContracts?: boolean;
  /** Nome da listagem CA ao vincular (busca no modal). */
  caNomeLista?: string;
};

export type RioCaBatchProgress = {
  offset: number;
  limit: number;
  globalTotal: number;
  batchNumber: number;
  batchCount: number;
  batchFrom: number;
  batchTo: number;
  hasMore: boolean;
};

function buildBatchProgress(
  offset: number,
  limit: number,
  globalTotal: number,
  sliceLen: number,
): RioCaBatchProgress {
  const batchNumber = Math.floor(offset / limit) + 1;
  const batchCount = globalTotal > 0 ? Math.ceil(globalTotal / limit) : 0;
  return {
    offset,
    limit,
    globalTotal,
    batchNumber,
    batchCount,
    batchFrom: globalTotal === 0 ? 0 : offset + 1,
    batchTo: offset + sliceLen,
    hasMore: offset + sliceLen < globalTotal,
  };
}

async function linkedLinhasOrdered(monthId: string) {
  const linhas = await prisma.rioCompClienteLinha.findMany({
    where: { monthId },
    select: { id: true, caPersonId: true },
    orderBy: [{ sortOrder: "asc" }, { nomeFantasia: "asc" }, { id: "asc" }],
  });
  return linhas.filter((l) => isRioCaPersonLinked(l.caPersonId));
}

async function unlinkedLinhasWithDocumento(monthId: string) {
  const linhas = await prisma.rioCompClienteLinha.findMany({
    where: { monthId },
    select: { id: true, caPersonId: true, documento: true },
    orderBy: [{ sortOrder: "asc" }, { nomeFantasia: "asc" }, { id: "asc" }],
  });
  return linhas.filter((l) => {
    if (isRioCaPersonLinked(l.caPersonId)) return false;
    return onlyDigits(l.documento ?? "").length >= 8;
  });
}

async function linhaToOut(linhaId: string): Promise<RioCompLinhaOut> {
  const raw = await prisma.rioCompClienteLinha.findUniqueOrThrow({
    where: { id: linhaId },
    include: {
      pdvs: { orderBy: [{ nome: "asc" }, { id: "asc" }] },
      rioGrupo: { select: { id: true, nome: true, sortOrder: true, systemTag: true } },
    },
  });
  const { rioGrupo: rg, ...core } = raw;
  return {
    ...core,
    pdvs: sortRioPdvsByNome(raw.pdvs),
    grupo: rg ?
      { id: rg.id, nome: rg.nome, sortOrder: rg.sortOrder, systemTag: rg.systemTag }
    : null,
  };
}

export async function applyCaPersonToRioLinha(
  linhaId: string,
  monthId: string,
  personId: string | null,
  accessToken: string,
  options?: RioCaLinhaRefreshOptions,
): Promise<RioCompLinhaOut> {
  const includePersonDetails = options?.includePersonDetails !== false;
  const includeContracts = options?.includeContracts !== false;
  const linha = await prisma.rioCompClienteLinha.findFirst({
    where: { id: linhaId, monthId },
  });
  if (!linha) throw new Error("line_not_found");

  if (!personId) {
    await prisma.rioCompClienteLinha.update({
      where: { id: linhaId },
      data: {
        caPersonId: rioCaUnlinkedPersonId(linhaId),
        emailCobranca: null,
      },
    });
    return linhaToOut(linhaId);
  }

  const pid = personId.trim();
  const linkingNewCa =
    isRioCaPersonLinked(pid) && !isRioCaPersonLinked(linha.caPersonId);
  const fetchCadastro = includePersonDetails || linkingNewCa;
  const nomeListaHint = options?.caNomeLista?.trim() || "";

  const clash = await prisma.rioCompClienteLinha.findFirst({
    where: { monthId, caPersonId: pid, NOT: { id: linhaId } },
    select: { id: true, nomeFantasia: true },
  });
  if (clash) {
    throw new Error(
      `ca_person_already_linked:${clash.nomeFantasia.slice(0, 80)}`,
    );
  }

  let email = linha.emailCobranca;
  let nomeFantasia = linha.nomeFantasia;
  let razaoSocial = linha.razaoSocial;
  let documento = linha.documento;
  let valorClienteTexto = linha.valorClienteTexto;
  let valorPdvUnitarioTexto = linha.valorPdvUnitarioTexto;
  let contratosAtivosTexto = linha.contratosAtivosTexto;

  if (fetchCadastro) {
    const raw = await fetchPersonDetail(accessToken, pid);
    const rec = asRecord(raw) ?? {};
    email = billingEmailJoined(raw);
    const nf = nomeFantasiaFromCaRaw(rec, nomeListaHint);
    nomeFantasia = nf || nomeListaHint || linha.nomeFantasia;
    razaoSocial = razaoFromRaw(rec) || nomeFantasia;
    documento = documentoFromRaw(rec, linha.documento);
    if (!includeContracts) {
      const valorPessoa = valorClienteFromRaw(rec);
      if (valorPessoa) valorClienteTexto = valorPessoa.slice(0, 200);
    }
  } else if (linkingNewCa && nomeListaHint) {
    nomeFantasia = nomeListaHint;
    razaoSocial = nomeListaHint;
  }

  if (includeContracts) {
    const contract = await fetchActiveContractSummaryForClient(accessToken, pid);
    if (contract?.numeros) contratosAtivosTexto = contract.numeros.slice(0, 400);
    if (contract?.valorTexto) {
      valorClienteTexto = contract.valorTexto.slice(0, 200);
      valorPdvUnitarioTexto = "";
    }
  }

  await prisma.rioCompClienteLinha.update({
    where: { id: linhaId },
    data: {
      caPersonId: pid,
      nomeFantasia: nomeFantasia.slice(0, 8000),
      razaoSocial: razaoSocial.slice(0, 8000),
      documento,
      emailCobranca: email,
      valorClienteTexto,
      valorPdvUnitarioTexto,
      contratosAtivosTexto,
    },
  });

  await syncRioCompNumeroPdvSiteFromPdvs(linhaId);

  return linhaToOut(linhaId);
}

export async function refreshRioMonthLinkedFromCa(
  monthId: string,
  accessToken: string,
): Promise<{ updated: number; failed: number; total: number }> {
  const linked = await linkedLinhasOrdered(monthId);
  let updated = 0;
  let failed = 0;
  for (const l of linked) {
    try {
      await applyCaPersonToRioLinha(l.id, monthId, l.caPersonId, accessToken);
      updated += 1;
    } catch {
      failed += 1;
    }
  }
  return { updated, failed, total: linked.length };
}

/** Atualiza um lote de linhas já vinculadas à CA (ordem da planilha). */
export async function refreshRioMonthLinkedFromCaBatch(
  monthId: string,
  accessToken: string,
  offset: number,
  limit: number,
  options?: RioCaLinhaRefreshOptions,
): Promise<{
  updated: number;
  failed: number;
  progress: RioCaBatchProgress;
  updatedLinhas: RioCompLinhaOut[];
}> {
  const linked = await linkedLinhasOrdered(monthId);
  const globalTotal = linked.length;
  const slice = linked.slice(offset, offset + limit);
  const progress = buildBatchProgress(offset, limit, globalTotal, slice.length);

  let updated = 0;
  let failed = 0;
  const updatedLinhas: RioCompLinhaOut[] = [];

  for (const l of slice) {
    try {
      const out = await applyCaPersonToRioLinha(
        l.id,
        monthId,
        l.caPersonId,
        accessToken,
        options,
      );
      updatedLinhas.push(out);
      updated += 1;
    } catch {
      failed += 1;
    }
  }

  return { updated, failed, progress, updatedLinhas };
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Tenta vincular linhas `import:*` pelo CNPJ/CPF (busca texto na API CA). */
export async function matchRioImportRowsByDocumento(
  monthId: string,
  accessToken: string,
): Promise<{ matched: number; ambiguous: number; notFound: number; alreadyLinked: number }> {
  const all = await prisma.rioCompClienteLinha.findMany({
    where: { monthId },
    select: { id: true, caPersonId: true, documento: true },
  });
  const alreadyLinked = all.filter((l) => isRioCaPersonLinked(l.caPersonId)).length;
  const candidates = await unlinkedLinhasWithDocumento(monthId);
  let matched = 0;
  let ambiguous = 0;
  let notFound = 0;

  for (const l of candidates) {
    const digits = onlyDigits(l.documento ?? "");
    const hits = await searchPeopleByText(accessToken, digits);
    if (hits.length === 0) {
      notFound += 1;
      continue;
    }
    if (hits.length > 1) {
      ambiguous += 1;
      continue;
    }
    try {
      await applyCaPersonToRioLinha(l.id, monthId, hits[0]!.id, accessToken);
      matched += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.startsWith("ca_person_already_linked")) ambiguous += 1;
      else notFound += 1;
    }
  }

  return { matched, ambiguous, notFound, alreadyLinked };
}

/** Casamento CNPJ/CPF em lote (mesma ordem da planilha). */
export async function matchRioImportRowsByDocumentoBatch(
  monthId: string,
  accessToken: string,
  offset: number,
  limit: number,
): Promise<{
  matched: number;
  ambiguous: number;
  notFound: number;
  progress: RioCaBatchProgress;
  updatedLinhas: RioCompLinhaOut[];
}> {
  const candidates = await unlinkedLinhasWithDocumento(monthId);
  const globalTotal = candidates.length;
  const slice = candidates.slice(offset, offset + limit);
  const progress = buildBatchProgress(offset, limit, globalTotal, slice.length);

  let matched = 0;
  let ambiguous = 0;
  let notFound = 0;
  const updatedLinhas: RioCompLinhaOut[] = [];

  for (const l of slice) {
    const digits = onlyDigits(l.documento ?? "");
    const hits = await searchPeopleByText(accessToken, digits);
    if (hits.length === 0) {
      notFound += 1;
      continue;
    }
    if (hits.length > 1) {
      ambiguous += 1;
      continue;
    }
    try {
      const out = await applyCaPersonToRioLinha(l.id, monthId, hits[0]!.id, accessToken);
      updatedLinhas.push(out);
      matched += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.startsWith("ca_person_already_linked")) ambiguous += 1;
      else notFound += 1;
    }
  }

  return { matched, ambiguous, notFound, progress, updatedLinhas };
}
