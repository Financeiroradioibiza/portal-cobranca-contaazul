import {
  fetchAllReceivableInstallments,
  fetchPeopleByIds,
  RECEIVABLE_STATUSES_PERIOD_TOTAL,
} from "@/lib/contaazul/receivables";
import { getValidAccessToken } from "@/lib/contaazul/session";
import type { CaReceivableItem } from "@/lib/contaazul/types";
import { todayYmdLocal } from "@/lib/contaazul/types";
import { defaultPeriodMonths } from "@/lib/format";
import type { SiteClientePermissoes } from "@/lib/site-cliente/permissions";
import { loadSiteClienteCobrancaEscopo } from "@/lib/site-cliente/siteClienteCobrancaEscopo";
import type { SiteClienteSessionPayload } from "@/lib/site-cliente/session";

export type SiteClienteCobrancaParcelaRow = {
  id: string;
  caPersonId: string;
  comp: string;
  due: string;
  summary: string;
  value: number;
  total: number;
  saldo: number;
  status: string;
  statusLabel: string;
  situacao: "paga" | "aberta" | "atrasada" | "parcial";
};

export type SiteClienteCobrancaClienteRow = {
  caPersonId: string;
  fantasy: string;
  cnpj: string;
  email: string;
  parcelas: SiteClienteCobrancaParcelaRow[];
};

export type SiteClienteCobrancaDashboardPayload = {
  ok: true;
  grupoNome: string;
  usuarioNome: string;
  permissoes: SiteClientePermissoes;
  period: { start: string; end: string };
  geradoEm: string;
  clientes: SiteClienteCobrancaClienteRow[];
};

function formatDocumento(raw?: string | null): string {
  if (!raw?.trim()) return "—";
  return raw.trim();
}

function parcelaIdFromItem(item: CaReceivableItem): string {
  return item.id_parcela?.trim() || item.idParcela?.trim() || item.id.trim();
}

function situacaoParcela(item: CaReceivableItem): SiteClienteCobrancaParcelaRow["situacao"] {
  const saldo = item.nao_pago ?? 0;
  const status = (item.status ?? "").toUpperCase();
  if (saldo <= 0 || status === "RECEBIDO") return "paga";
  if (status === "RECEBIDO_PARCIAL") return "parcial";
  const today = todayYmdLocal();
  if (item.data_vencimento && item.data_vencimento < today) return "atrasada";
  return "aberta";
}

function mapParcela(item: CaReceivableItem, caPersonId: string): SiteClienteCobrancaParcelaRow {
  const situacao = situacaoParcela(item);
  const saldo = item.nao_pago ?? 0;
  const total = item.total ?? saldo;
  const value = situacao === "paga" ? total : saldo;
  return {
    id: parcelaIdFromItem(item),
    caPersonId,
    comp: item.data_competencia?.slice(0, 10) ?? "—",
    due: item.data_vencimento?.slice(0, 10) ?? "—",
    summary: item.descricao ?? "—",
    value,
    total,
    saldo,
    status: item.status ?? "",
    statusLabel: item.status_traduzido?.trim() || item.status || "—",
    situacao,
  };
}

export function assertSiteClienteCobrancaAccess(session: SiteClienteSessionPayload): void {
  if (session.grupoTipo !== "cobranca") {
    throw new Response(JSON.stringify({ error: "wrong_grupo_tipo" }), { status: 403 });
  }
  if (!session.permissoes.verCobrancas) {
    throw new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
}

export async function buildSiteClienteCobrancaDashboard(
  session: SiteClienteSessionPayload,
): Promise<SiteClienteCobrancaDashboardPayload> {
  assertSiteClienteCobrancaAccess(session);

  const escopo = await loadSiteClienteCobrancaEscopo(session.grupoId);
  const period = defaultPeriodMonths(12);
  const perm = session.permissoes;

  if (escopo.caPersonIds.size === 0) {
    return {
      ok: true,
      grupoNome: session.grupoNome,
      usuarioNome: session.nome,
      permissoes: perm,
      period,
      geradoEm: new Date().toISOString(),
      clientes: [],
    };
  }

  const token = await getValidAccessToken();
  if (!token) {
    throw new Response(JSON.stringify({ error: "conta_azul_indisponivel" }), { status: 503 });
  }

  const items = await fetchAllReceivableInstallments(token, period.start, period.end, {
    statuses: RECEIVABLE_STATUSES_PERIOD_TOTAL,
  });

  const scoped = items.filter((it) => {
    const cid = it.cliente?.id?.trim();
    return cid ? escopo.caPersonIds.has(cid) : false;
  });

  const byClient = new Map<string, CaReceivableItem[]>();
  for (const it of scoped) {
    const cid = it.cliente!.id.trim();
    const arr = byClient.get(cid) ?? [];
    arr.push(it);
    byClient.set(cid, arr);
  }

  const people = await fetchPeopleByIds(token, [...byClient.keys()]);
  const clientes: SiteClienteCobrancaClienteRow[] = [];

  for (const caPersonId of escopo.caPersonIds) {
    const parcelasRaw = byClient.get(caPersonId) ?? [];
    if (parcelasRaw.length === 0) continue;

    const meta = escopo.byCaPersonId.get(caPersonId);
    const p = people.get(caPersonId);
    const fantasy =
      meta?.nomeFantasia?.trim() ||
      meta?.razaoSocial?.trim() ||
      p?.nome?.trim() ||
      parcelasRaw[0]?.cliente?.nome?.trim() ||
      "Cliente";

    const parcelas = parcelasRaw
      .map((p) => mapParcela(p, caPersonId))
      .sort((a, b) => b.due.localeCompare(a.due));

    clientes.push({
      caPersonId,
      fantasy,
      cnpj: formatDocumento(meta?.documento ?? p?.documento),
      email: meta?.emailCobranca?.trim() || p?.email?.trim() || "—",
      parcelas,
    });
  }

  clientes.sort((a, b) => a.fantasy.localeCompare(b.fantasy, "pt-BR"));

  return {
    ok: true,
    grupoNome: session.grupoNome,
    usuarioNome: session.nome,
    permissoes: perm,
    period,
    geradoEm: new Date().toISOString(),
    clientes,
  };
}
