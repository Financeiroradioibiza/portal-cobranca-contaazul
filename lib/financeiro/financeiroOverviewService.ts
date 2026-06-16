import { fetchAllReceivableInstallments, fetchPeopleByIds } from "@/lib/contaazul/receivables";
import { getValidAccessToken } from "@/lib/contaazul/session";
import type { CaReceivableItem } from "@/lib/contaazul/types";
import { isPastDueOpen } from "@/lib/contaazul/types";
import {
  addDaysYmd,
  chartMonthsFrom,
  currentOverviewContext,
  dueInYearMonth,
  ymdCompare,
} from "@/lib/financeiro/financeiroOverviewDates";
import { formatYearMonthLabel } from "@/lib/manualReminders/yearMonth";

export type FinanceiroOverviewCards = {
  totalPrevistoMes: number;
  receitasAbertoMes: number;
  atrasadoUltimos30Dias: number;
  atrasadoMesPassado: number;
  atrasadoSegundoMesPassado: number;
  atrasadoTerceiroMesPassado: number;
  previsaoMesSeguinte: number;
};

export type FinanceiroTopDevedor = {
  clientId: string;
  nome: string;
  cnpj: string;
  totalAberto: number;
  parcelas: number;
};

export type FinanceiroChartMonth = {
  ym: number;
  label: string;
  totalPeriodo: number;
};

export type FinanceiroOverviewPayload = {
  ok: true;
  fetchedAt: string;
  period: { start: string; end: string };
  competenciaAtual: number;
  labels: {
    mesAtual: string;
    mesPassado: string;
    segundoMesPassado: string;
    terceiroMesPassado: string;
    mesSeguinte: string;
  };
  cards: FinanceiroOverviewCards;
  topDevedores: FinanceiroTopDevedor[];
  chartMensal: FinanceiroChartMonth[];
};

function sum(items: CaReceivableItem[], pick: (it: CaReceivableItem) => number): number {
  let t = 0;
  for (const it of items) t += pick(it);
  return Math.round(t * 100) / 100;
}

function overdueInMonth(items: CaReceivableItem[], ym: number, today: string): number {
  return sum(items, (it) =>
    isPastDueOpen(it) && dueInYearMonth(it.data_vencimento, ym) ? it.nao_pago : 0,
  );
}

function buildTopDevedores(
  items: CaReceivableItem[],
  people: Map<string, { id: string; nome: string; documento?: string | null }>,
  startYmd: string,
  endYmd: string,
): FinanceiroTopDevedor[] {
  const byClient = new Map<string, { total: number; count: number }>();
  for (const it of items) {
    if (!it.nao_pago || it.nao_pago <= 0) continue;
    const due = it.data_vencimento?.slice(0, 10);
    if (!due || ymdCompare(due, startYmd) < 0 || ymdCompare(due, endYmd) > 0) continue;
    const cid = it.cliente?.id;
    if (!cid) continue;
    const cur = byClient.get(cid) ?? { total: 0, count: 0 };
    cur.total += it.nao_pago;
    cur.count += 1;
    byClient.set(cid, cur);
  }

  return [...byClient.entries()]
    .map(([clientId, agg]) => {
      const p = people.get(clientId);
      return {
        clientId,
        nome: p?.nome?.trim() || "Cliente",
        cnpj: p?.documento?.trim() || "—",
        totalAberto: Math.round(agg.total * 100) / 100,
        parcelas: agg.count,
      };
    })
    .sort((a, b) => b.totalAberto - a.totalAberto)
    .slice(0, 5);
}

export async function buildFinanceiroOverview(): Promise<FinanceiroOverviewPayload | { error: string }> {
  const token = await getValidAccessToken();
  if (!token) return { error: "not_connected" };

  const ctx = currentOverviewContext();
  const items = await fetchAllReceivableInstallments(token, ctx.fetchStart, ctx.fetchEnd);

  const cards: FinanceiroOverviewCards = {
    totalPrevistoMes: sum(items, (it) =>
      dueInYearMonth(it.data_vencimento, ctx.ym) ? it.total : 0,
    ),
    receitasAbertoMes: sum(items, (it) =>
      dueInYearMonth(it.data_vencimento, ctx.ym) && it.nao_pago > 0 ? it.nao_pago : 0,
    ),
    atrasadoUltimos30Dias: sum(items, (it) => {
      const due = it.data_vencimento?.slice(0, 10);
      if (!due || !isPastDueOpen(it)) return 0;
      const desde = addDaysYmd(ctx.today, -30);
      if (ymdCompare(due, desde) < 0 || ymdCompare(due, ctx.today) >= 0) return 0;
      return it.nao_pago;
    }),
    atrasadoMesPassado: overdueInMonth(items, ctx.mesPassado, ctx.today),
    atrasadoSegundoMesPassado: overdueInMonth(items, ctx.segundoMesPassado, ctx.today),
    atrasadoTerceiroMesPassado: overdueInMonth(items, ctx.terceiroMesPassado, ctx.today),
    previsaoMesSeguinte: sum(items, (it) =>
      dueInYearMonth(it.data_vencimento, ctx.mesSeguinte) ? it.total : 0,
    ),
  };

  const chartMensal: FinanceiroChartMonth[] = chartMonthsFrom(ctx.chartStartYm, 12).map((ym) => ({
    ym,
    label: formatYearMonthLabel(ym),
    totalPeriodo: sum(items, (it) => (dueInYearMonth(it.data_vencimento, ym) ? it.total : 0)),
  }));

  const topClientIds = new Set<string>();
  for (const it of items) {
    if (!it.nao_pago || it.nao_pago <= 0) continue;
    const due = it.data_vencimento?.slice(0, 10);
    if (!due || ymdCompare(due, ctx.topDevedoresStart) < 0 || ymdCompare(due, ctx.fetchEnd) > 0) continue;
    if (it.cliente?.id) topClientIds.add(it.cliente.id);
  }

  const people = await fetchPeopleByIds(token, [...topClientIds]);
  const topDevedores = buildTopDevedores(items, people, ctx.topDevedoresStart, ctx.fetchEnd);

  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    period: { start: ctx.fetchStart, end: ctx.fetchEnd },
    competenciaAtual: ctx.ym,
    labels: {
      mesAtual: ctx.labelMesAtual,
      mesPassado: ctx.labelMesPassado,
      segundoMesPassado: ctx.labelSegundoMesPassado,
      terceiroMesPassado: ctx.labelTerceiroMesPassado,
      mesSeguinte: ctx.labelMesSeguinte,
    },
    cards,
    topDevedores,
    chartMensal,
  };
}
