import { prisma } from "@/lib/prisma";
import { fetchActiveContractSummaryForClient } from "@/lib/contaazul/contracts";
import { billingEmailJoined, fetchPersonDetail, searchPeopleByText } from "@/lib/contaazul/personBilling";
import { sortRioPdvsByNome } from "@/lib/rio/pdvNames";
import type { RioCompLinhaOut } from "@/lib/rio/rioClienteCompService";

function asRecord(o: unknown): Record<string, unknown> | null {
  return typeof o === "object" && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
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

async function linhaToOut(linhaId: string): Promise<RioCompLinhaOut> {
  const raw = await prisma.rioCompClienteLinha.findUniqueOrThrow({
    where: { id: linhaId },
    include: {
      pdvs: { orderBy: [{ nome: "asc" }, { id: "asc" }] },
      rioGrupo: { select: { id: true, nome: true, sortOrder: true } },
    },
  });
  const { rioGrupo: rg, ...core } = raw;
  return {
    ...core,
    pdvs: sortRioPdvsByNome(raw.pdvs),
    grupo: rg ? { id: rg.id, nome: rg.nome, sortOrder: rg.sortOrder } : null,
  };
}

export async function applyCaPersonToRioLinha(
  linhaId: string,
  monthId: string,
  personId: string | null,
  accessToken: string,
): Promise<RioCompLinhaOut> {
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
  const clash = await prisma.rioCompClienteLinha.findFirst({
    where: { monthId, caPersonId: pid, NOT: { id: linhaId } },
    select: { id: true, nomeFantasia: true },
  });
  if (clash) {
    throw new Error(
      `ca_person_already_linked:${clash.nomeFantasia.slice(0, 80)}`,
    );
  }

  const raw = await fetchPersonDetail(accessToken, pid);
  const rec = asRecord(raw) ?? {};
  const email = billingEmailJoined(raw);
  const nomeFantasia = nomeFantasiaFromRaw(rec) || linha.nomeFantasia;
  const razaoSocial = razaoFromRaw(rec) || linha.razaoSocial;
  const documento = documentoFromRaw(rec, linha.documento);

  let valorClienteTexto = linha.valorClienteTexto;
  let valorPdvUnitarioTexto = linha.valorPdvUnitarioTexto;
  let contratosAtivosTexto = linha.contratosAtivosTexto;

  const contract = await fetchActiveContractSummaryForClient(accessToken, pid);
  if (contract?.numeros) contratosAtivosTexto = contract.numeros.slice(0, 400);
  if (contract?.valorTexto) {
    valorClienteTexto = contract.valorTexto.slice(0, 200);
    valorPdvUnitarioTexto = "";
  } else {
    const valorPessoa = valorClienteFromRaw(rec);
    if (valorPessoa) valorClienteTexto = valorPessoa.slice(0, 200);
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

  return linhaToOut(linhaId);
}

export async function refreshRioMonthLinkedFromCa(
  monthId: string,
  accessToken: string,
): Promise<{ updated: number; failed: number; total: number }> {
  const linhas = await prisma.rioCompClienteLinha.findMany({
    where: { monthId },
    select: { id: true, caPersonId: true },
  });
  const linked = linhas.filter((l) => isRioCaPersonLinked(l.caPersonId));
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

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Tenta vincular linhas `import:*` pelo CNPJ/CPF (busca texto na API CA). */
export async function matchRioImportRowsByDocumento(
  monthId: string,
  accessToken: string,
): Promise<{ matched: number; ambiguous: number; notFound: number; alreadyLinked: number }> {
  const linhas = await prisma.rioCompClienteLinha.findMany({
    where: { monthId },
    select: { id: true, caPersonId: true, documento: true },
  });

  let matched = 0;
  let ambiguous = 0;
  let notFound = 0;
  let alreadyLinked = 0;

  for (const l of linhas) {
    if (isRioCaPersonLinked(l.caPersonId)) {
      alreadyLinked += 1;
      continue;
    }
    const digits = onlyDigits(l.documento ?? "");
    if (digits.length < 8) {
      notFound += 1;
      continue;
    }
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
