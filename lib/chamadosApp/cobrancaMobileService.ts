import { getProducaoRioSourceYm } from "@/lib/cadastros/producaoCatalogo";
import { loadRioLinhasForProducao } from "@/lib/cadastros/producaoMovimento";
import {
  cobrancaPlusPrincipalEmailsJoined,
  fetchPersonDetail,
} from "@/lib/contaazul/personBilling";
import {
  fetchAllReceivableInstallments,
  RECEIVABLE_STATUSES_PERIOD_TOTAL,
} from "@/lib/contaazul/receivables";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { defaultPeriodMonths, displayBrazilianTaxId, onlyDigits, parseEmailAddresses } from "@/lib/format";
import { isRioCaPersonLinked } from "@/lib/rio/rioCaPersonLink";
import { prisma } from "@/lib/prisma";

export type ChamadosCobrancaSearchHit = {
  linhaId: string;
  nome: string;
  documentoDisplay: string;
  emailPreview: string | null;
};

export type ChamadosCobrancaVenda = {
  parcelaId: string;
  competencia: string;
  vencimento: string;
  resumo: string;
  valor: number;
  statusLabel: string;
};

export type ChamadosCobrancaClienteDetail = {
  linhaId: string;
  nome: string;
  cnpj: string;
  emails: string[];
  caConnected: boolean;
  caLinked: boolean;
  vendas: ChamadosCobrancaVenda[];
};

function mergeEmails(...blocks: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const block of blocks) {
    if (!block?.trim()) continue;
    for (const addr of parseEmailAddresses(block)) {
      const k = addr.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(addr);
    }
  }
  return out;
}

function matchesPlanilhaCliente(
  row: {
    nomeFantasia: string;
    razaoSocial: string;
    documento: string | null;
    emailCobranca: string | null;
  },
  needle: string,
): boolean {
  const q = needle.trim().toLowerCase();
  if (q.length < 2) return false;

  const cnpjDigits = onlyDigits(needle);
  if (cnpjDigits.length >= 4) {
    const rowDigits = onlyDigits(row.documento ?? "");
    if (rowDigits.includes(cnpjDigits)) return true;
  }

  const hay = [
    row.nomeFantasia,
    row.razaoSocial,
    row.documento ?? "",
    row.emailCobranca ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (hay.includes(q)) return true;

  const words = q.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return false;
  return words.every((w) => hay.includes(w));
}

export async function searchChamadosCobrancaClientes(
  q: string,
  limit = 30,
): Promise<ChamadosCobrancaSearchHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];

  const ym = await getProducaoRioSourceYm();
  const linhas = await loadRioLinhasForProducao(ym);
  const ids = linhas.map((l) => l.id);
  const emailRows =
    ids.length ?
      await prisma.rioCompClienteLinha.findMany({
        where: { id: { in: ids } },
        select: { id: true, emailCobranca: true },
      })
    : [];
  const emailById = new Map(emailRows.map((r) => [r.id, r.emailCobranca]));

  const hits: ChamadosCobrancaSearchHit[] = [];
  for (const ln of linhas) {
    const emailCobranca = emailById.get(ln.id) ?? null;
    if (
      !matchesPlanilhaCliente(
        {
          nomeFantasia: ln.nomeFantasia,
          razaoSocial: ln.razaoSocial ?? "",
          documento: ln.documento ?? null,
          emailCobranca,
        },
        term,
      )
    ) {
      continue;
    }
    const nome = ln.nomeFantasia.trim() || ln.razaoSocial?.trim() || "Cliente";
    const emails = mergeEmails(emailCobranca);
    hits.push({
      linhaId: ln.id,
      nome,
      documentoDisplay: displayBrazilianTaxId(ln.documento),
      emailPreview: emails[0] ?? null,
    });
    if (hits.length >= limit) break;
  }

  hits.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return hits;
}

function parcelaIdFromItem(it: {
  id: string;
  id_parcela?: string;
  idParcela?: string;
}): string {
  const explicit = it.id_parcela?.trim() || it.idParcela?.trim();
  return explicit || it.id.trim();
}

async function listUltimasVendasEmitidas(caPersonId: string): Promise<ChamadosCobrancaVenda[]> {
  const token = await getValidAccessToken();
  if (!token) return [];

  const period = defaultPeriodMonths(18);
  const items = await fetchAllReceivableInstallments(token, period.start, period.end, {
    maxPages: 8,
    parallelBatch: 2,
    statuses: RECEIVABLE_STATUSES_PERIOD_TOTAL,
  });

  return items
    .filter((it) => it.cliente?.id === caPersonId)
    .sort((a, b) => {
      const da = a.data_competencia || a.data_vencimento || "";
      const db = b.data_competencia || b.data_vencimento || "";
      return db.localeCompare(da);
    })
    .slice(0, 6)
    .map((it) => ({
      parcelaId: parcelaIdFromItem(it),
      competencia: it.data_competencia?.slice(0, 10) ?? "—",
      vencimento: it.data_vencimento?.slice(0, 10) ?? "—",
      resumo: it.descricao?.trim() || "—",
      valor: it.total ?? it.nao_pago ?? 0,
      statusLabel: it.status_traduzido?.trim() || it.status?.trim() || "—",
    }));
}

export async function getChamadosCobrancaClienteDetail(
  linhaId: string,
): Promise<ChamadosCobrancaClienteDetail | null> {
  const id = linhaId.trim();
  if (!id) return null;

  const ym = await getProducaoRioSourceYm();
  const linhas = await loadRioLinhasForProducao(ym);
  const ln = linhas.find((l) => l.id === id);
  if (!ln) return null;

  const row = await prisma.rioCompClienteLinha.findUnique({
    where: { id },
    select: { emailCobranca: true },
  });

  const nome = ln.nomeFantasia.trim() || ln.razaoSocial?.trim() || "Cliente";
  const cnpj = displayBrazilianTaxId(ln.documento);
  let emails = mergeEmails(row?.emailCobranca);

  const caPersonId = ln.caPersonId?.trim() ?? "";
  const caLinked = isRioCaPersonLinked(caPersonId);
  const token = await getValidAccessToken();
  const caConnected = Boolean(token);

  if (token && caLinked) {
    try {
      const raw = await fetchPersonDetail(token, caPersonId);
      emails = mergeEmails(emails.join("; "), cobrancaPlusPrincipalEmailsJoined(raw));
    } catch {
      /* planilha only */
    }
  }

  const vendas =
    token && caLinked ? await listUltimasVendasEmitidas(caPersonId) : [];

  return {
    linhaId: id,
    nome,
    cnpj,
    emails,
    caConnected,
    caLinked,
    vendas,
  };
}
