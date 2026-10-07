import { caFetch } from "@/lib/contaazul/caHttp";
import { addDaysYmd, brazilTodayYmd } from "@/lib/financeiro/financeiroOverviewDates";
import type { SaleRow } from "@/lib/types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function numField(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return parseInt(v, 10);
  return undefined;
}

function danfseFilenameFromVenda(vendaDetalhes: Record<string, unknown>, vendaNumero?: number): string {
  const rps =
    numField(vendaDetalhes.numero_rps) ??
    numField(vendaDetalhes.numeroRps) ??
    numField((vendaDetalhes.nota_servico as Record<string, unknown> | undefined)?.numero_rps);
  if (rps) return `RPS-${rps}.pdf`;
  const nfse =
    numField(vendaDetalhes.numero_nfse) ??
    numField(vendaDetalhes.numeroNfse) ??
    numField((vendaDetalhes.nota_servico as Record<string, unknown> | undefined)?.numero);
  if (nfse) return `NFS-e-${nfse}.pdf`;
  if (vendaNumero != null && vendaNumero > 0) return `NFS-e-venda-${vendaNumero}.pdf`;
  return "nota.pdf";
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
): Promise<{ sales: SaleRow[]; vendaId?: string; vendaNumero?: number; danfseFilename: string }> {
  const today = brazilTodayYmd();
  const desde = addDaysYmd(today, -lookbackDays);
  const vendas = await caFetch<{ itens?: unknown[] }>(
    `/v1/venda/busca?ids_clientes=${encodeURIComponent(clienteId)}&data_inicio=${desde}&data_fim=${today}&tamanho_pagina=10&campo_ordenado_descendente=DATA`,
    token,
  );
  const vendaRaw = vendas.itens?.[0];
  if (!isRecord(vendaRaw)) return { sales: [], danfseFilename: "nota.pdf" };
  const vendaId = String(vendaRaw.id ?? "").trim();
  if (!vendaId) return { sales: [], danfseFilename: "nota.pdf" };
  const vendaNumero = Number(vendaRaw.numero);
  const vendaDetalhes = await caFetch<Record<string, unknown>>(`/v1/venda/${encodeURIComponent(vendaId)}`, token);
  const danfseFilename = danfseFilenameFromVenda(
    vendaDetalhes,
    Number.isFinite(vendaNumero) ? vendaNumero : undefined,
  );
  const evento = vendaDetalhes.evento_financeiro;
  const eventoId =
    isRecord(evento) ? String(evento.id ?? "").trim() : "";
  if (!eventoId) {
    return {
      sales: [],
      vendaId,
      vendaNumero: Number.isFinite(vendaNumero) ? vendaNumero : undefined,
      danfseFilename,
    };
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
  return {
    sales,
    vendaId,
    vendaNumero: Number.isFinite(vendaNumero) ? vendaNumero : undefined,
    danfseFilename,
  };
}
