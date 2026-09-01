import {
  fetchAllReceivableInstallments,
  fetchPeopleByIds,
  RECEIVABLE_STATUSES_PERIOD_TOTAL,
} from "@/lib/contaazul/receivables";
import { getValidAccessToken } from "@/lib/contaazul/session";
import type { CaReceivableItem } from "@/lib/contaazul/types";
import { todayYmdLocal } from "@/lib/contaazul/types";
import { addMonthsToYmd, defaultPeriodMonths } from "@/lib/format";
import type { SiteClientePermissoes } from "@/lib/site-cliente/permissions";
import { loadSiteClienteCobrancaEscopo } from "@/lib/site-cliente/siteClienteCobrancaEscopo";
import {
  loadSiteClienteCobrancaPdvInstalacao,
  type SiteClienteCobrancaPdvInstalacaoRow,
} from "@/lib/site-cliente/siteClienteCobrancaPdvInstalacao";
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
  period: { start: string; end: string; filtro: "competencia" };
  geradoEm: string;
  /** Status de instalação dos PDVs ligados aos CNPJs do grupo (produção). */
  pdvsInstalacao: SiteClienteCobrancaPdvInstalacaoRow[];
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

function competenciaYmd(item: CaReceivableItem): string | null {
  const comp = item.data_competencia?.trim().slice(0, 10);
  return comp && /^\d{4}-\d{2}-\d{2}$/.test(comp) ? comp : null;
}

/** Emissões (competência CA) no intervalo inclusivo [start, end]. */
function emissaoNoPeriodo(item: CaReceivableItem, start: string, end: string): boolean {
  const comp = competenciaYmd(item);
  if (!comp) return false;
  return comp >= start && comp <= end;
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
  /** Site cobrança: emissões (competência) nos últimos 12 meses — não cortar por vencimento futuro. */
  const period = { ...defaultPeriodMonths(12), filtro: "competencia" as const };
  const perm = session.permissoes;

  const pdvsInstalacao = await loadSiteClienteCobrancaPdvInstalacao(session.grupoId);

  if (escopo.caPersonIds.size === 0) {
    return {
      ok: true,
      grupoNome: session.grupoNome,
      usuarioNome: session.nome,
      permissoes: perm,
      period,
      geradoEm: new Date().toISOString(),
      pdvsInstalacao,
      clientes: [],
    };
  }

  const token = await getValidAccessToken();
  if (!token) {
    throw new Response(JSON.stringify({ error: "conta_azul_indisponivel" }), { status: 503 });
  }

  /** Vencimento amplo na API (campo obrigatório) — filtro real é competência/emissão. */
  const vencimentoAte = addMonthsToYmd(period.end, 12);
  const items = await fetchAllReceivableInstallments(token, period.start, vencimentoAte, {
    statuses: RECEIVABLE_STATUSES_PERIOD_TOTAL,
    dataCompetenciaDe: period.start,
    dataCompetenciaAte: period.end,
  });

  const scoped = items.filter((it) => {
    const cid = it.cliente?.id?.trim();
    if (!cid || !escopo.caPersonIds.has(cid)) return false;
    return emissaoNoPeriodo(it, period.start, period.end);
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
    pdvsInstalacao,
    clientes,
  };
}
