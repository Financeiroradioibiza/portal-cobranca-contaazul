import { caFetch } from "@/lib/contaazul/caHttp";
import { addDaysYmd, brazilTodayYmd } from "@/lib/financeiro/financeiroOverviewDates";
import type { SaleRow } from "@/lib/types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parcelaToSaleRow(raw: unknown): SaleRow | null {
  if (!isRecord(raw)) return null;
  const id = String(raw.id ?? raw.id_parcela ?? raw.idParcela ?? "").trim();
  if (!id) return null;
  const due = String(raw.data_vencimento ?? raw.dataVencimento ?? "").slice(0, 10);
  if (!due) return null;
  const comp = String(raw.data_competencia ?? raw.dataCompetencia ?? due).slice(0, 10);
  const summary = String(raw.descricao ?? raw.description ?? "Parcela").trim() || "Parcela";
  const naoPago = Number(raw.nao_pago ?? raw.naoPago ?? raw.valor ?? 0);
  const value = Number.isFinite(naoPago) ? naoPago : 0;
  return { id, comp, due, summary, value };
}

/** Última venda CA do cliente → parcelas do evento financeiro (mesmo critério do Vercel). */
export async function resolveEnvioManualSalesForCliente(
  token: string,
  clienteId: string,
  lookbackDays = 15,
): Promise<{ sales: SaleRow[]; vendaNumero?: number }> {
  const today = brazilTodayYmd();
  const desde = addDaysYmd(today, -lookbackDays);
  const vendas = await caFetch<{ itens?: unknown[] }>(
    `/v1/venda/busca?ids_clientes=${encodeURIComponent(clienteId)}&data_inicio=${desde}&data_fim=${today}&tamanho_pagina=10&campo_ordenado_descendente=DATA`,
    token,
  );
  const vendaRaw = vendas.itens?.[0];
  if (!isRecord(vendaRaw)) return { sales: [] };
  const vendaId = String(vendaRaw.id ?? "").trim();
  if (!vendaId) return { sales: [] };
  const vendaNumero = Number(vendaRaw.numero);
  const vendaDetalhes = await caFetch<Record<string, unknown>>(`/v1/venda/${encodeURIComponent(vendaId)}`, token);
  const evento = vendaDetalhes.evento_financeiro;
  const eventoId =
    isRecord(evento) ? String(evento.id ?? "").trim() : "";
  if (!eventoId) {
    return { sales: [], vendaNumero: Number.isFinite(vendaNumero) ? vendaNumero : undefined };
  }
  const parcelas = await caFetch<unknown>(
    `/v1/financeiro/eventos-financeiros/${encodeURIComponent(eventoId)}/parcelas`,
    token,
  );
  const list = Array.isArray(parcelas) ? parcelas : [];
  const sales: SaleRow[] = [];
  for (const p of list) {
    const row = parcelaToSaleRow(p);
    if (row) sales.push(row);
  }
  return { sales, vendaNumero: Number.isFinite(vendaNumero) ? vendaNumero : undefined };
}
