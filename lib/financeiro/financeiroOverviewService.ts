import { fetchAllReceivableInstallments } from "@/lib/contaazul/receivables";
import { getValidAccessToken } from "@/lib/contaazul/session";
import type { CaReceivableItem } from "@/lib/contaazul/types";
import { isPastDueOpen } from "@/lib/contaazul/types";
import {
  addDaysYmd,
  currentOverviewContext,
  dueInYearMonth,
  ymFirstDay,
  ymLastDay,
  ymdCompare,
} from "@/lib/financeiro/financeiroOverviewDates";

export type FinanceiroOverviewCards = {
  totalPrevistoMes: number;
  receitasAbertoMes: number;
  atrasadoUltimos30Dias: number;
  atrasadoMesPassado: number;
  atrasadoSegundoMesPassado: number;
  atrasadoTerceiroMesPassado: number;
  previsaoMesSeguinte: number;
};

export type FinanceiroOverviewPayload = {
  ok: true;
  fetchedAt: string;
  competenciaAtual: number;
  labels: {
    mesAtual: string;
    mesPassado: string;
    segundoMesPassado: string;
    terceiroMesPassado: string;
    mesSeguinte: string;
  };
  cards: FinanceiroOverviewCards;
};

function sum(items: CaReceivableItem[], pick: (it: CaReceivableItem) => number): number {
  let t = 0;
  for (const it of items) t += pick(it);
  return Math.round(t * 100) / 100;
}

function overdueInMonth(items: CaReceivableItem[], ym: number): number {
  return sum(items, (it) =>
    isPastDueOpen(it) && dueInYearMonth(it.data_vencimento, ym) ? it.nao_pago : 0,
  );
}

/** Busca mês a mês em paralelo — evita uma única consulta gigante na Conta Azul. */
async function fetchOverviewInstallments(
  token: string,
  months: number[],
): Promise<CaReceivableItem[]> {
  const maxPages = Math.min(
    20,
    Math.max(5, Number(process.env.CA_OVERVIEW_MAX_PAGES_PER_MONTH ?? "12") || 12),
  );
  const chunks = await Promise.all(
    months.map((ym) =>
      fetchAllReceivableInstallments(token, ymFirstDay(ym), ymLastDay(ym), { maxPages }),
    ),
  );
  return chunks.flat();
}

export async function buildFinanceiroOverview(): Promise<FinanceiroOverviewPayload | { error: string }> {
  const token = await getValidAccessToken();
  if (!token) return { error: "not_connected" };

  const ctx = currentOverviewContext();
  const items = await fetchOverviewInstallments(token, ctx.fetchMonths);

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
    atrasadoMesPassado: overdueInMonth(items, ctx.mesPassado),
    atrasadoSegundoMesPassado: overdueInMonth(items, ctx.segundoMesPassado),
    atrasadoTerceiroMesPassado: overdueInMonth(items, ctx.terceiroMesPassado),
    previsaoMesSeguinte: sum(items, (it) =>
      dueInYearMonth(it.data_vencimento, ctx.mesSeguinte) ? it.total : 0,
    ),
  };

  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    competenciaAtual: ctx.ym,
    labels: {
      mesAtual: ctx.labelMesAtual,
      mesPassado: ctx.labelMesPassado,
      segundoMesPassado: ctx.labelSegundoMesPassado,
      terceiroMesPassado: ctx.labelTerceiroMesPassado,
      mesSeguinte: ctx.labelMesSeguinte,
    },
    cards,
  };
}
