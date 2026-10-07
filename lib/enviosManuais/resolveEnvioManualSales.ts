import { caFetch } from "@/lib/contaazul/caHttp";
import { normalizeReceivableItem } from "@/lib/contaazul/normalizeReceivable";
import type { CaReceivableItem } from "@/lib/contaazul/types";
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

/** Mesmo critério do Financeiro → Vencidos (`id_parcela` antes de `id`). */
function receivableToSaleRow(it: CaReceivableItem): SaleRow {
  const parcelaId = it.id_parcela?.trim() || it.idParcela?.trim() || it.id.trim();
  return {
    id: parcelaId,
    comp: it.data_competencia?.slice(0, 10) ?? it.data_vencimento.slice(0, 10),
    due: it.data_vencimento.slice(0, 10),
    summary: it.descricao ?? "Parcela",
    value: it.nao_pago,
  };
}

function parcelaToSaleRow(raw: unknown): SaleRow | null {
  if (!isRecord(raw)) return null;
  const idParcela = String(raw.id_parcela ?? raw.idParcela ?? "").trim();
  const id = idParcela || String(raw.id ?? "").trim();
  if (!id) return null;
  const due = String(raw.data_vencimento ?? raw.dataVencimento ?? "").slice(0, 10);
  if (!due) return null;
  const comp = String(raw.data_competencia ?? raw.dataCompetencia ?? due).slice(0, 10);
  const summary = String(raw.descricao ?? raw.description ?? "Parcela").trim() || "Parcela";
  const naoPago = Number(raw.nao_pago ?? raw.naoPago ?? raw.valor ?? 0);
  const value = Number.isFinite(naoPago) ? naoPago : 0;
  return { id, comp, due, summary, value };
}

const OPEN_STATUSES = ["ATRASADO", "EM_ABERTO", "RECEBIDO_PARCIAL"] as const;

/** Parcelas em aberto do cliente — mesma origem/ID que Vencidos (`contas-a-receber/buscar`). */
async function fetchOpenReceivablesForCliente(
  token: string,
  clienteId: string,
  lookbackDays: number,
): Promise<CaReceivableItem[]> {
  const today = brazilTodayYmd();
  const desde = addDaysYmd(today, -Math.max(lookbackDays, 30));
  const ate = addDaysYmd(today, 45);
  const qs = new URLSearchParams();
  qs.set("pagina", "1");
  qs.set("tamanho_pagina", "100");
  qs.set("data_vencimento_de", desde);
  qs.set("data_vencimento_ate", ate);
  qs.append("ids_clientes", clienteId);
  for (const s of OPEN_STATUSES) qs.append("status", s);

  const res = await caFetch<{ itens?: unknown[]; items?: unknown[] }>(
    `/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?${qs.toString()}`,
    token,
  );
  const rawList = res.itens ?? res.items ?? [];
  const out: CaReceivableItem[] = [];
  for (const row of rawList) {
    const norm = normalizeReceivableItem(row);
    if (!norm || norm.cliente?.id !== clienteId) continue;
    if (!norm.nao_pago || norm.nao_pago <= 0) continue;
    out.push(norm);
  }
  out.sort((a, b) => b.data_vencimento.localeCompare(a.data_vencimento));
  return out;
}

async function salesFromLatestVendaEvent(
  token: string,
  clienteId: string,
  lookbackDays: number,
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
  const eventoId = isRecord(evento) ? String(evento.id ?? "").trim() : "";
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

/** Parcelas + metadados de venda para envio manual (prioriza busca igual Vencidos). */
export async function resolveEnvioManualSalesForCliente(
  token: string,
  clienteId: string,
  lookbackDays = 15,
): Promise<{ sales: SaleRow[]; vendaId?: string; vendaNumero?: number; danfseFilename: string }> {
  const receivables = await fetchOpenReceivablesForCliente(token, clienteId, lookbackDays);
  if (receivables.length) {
    return {
      sales: receivables.map(receivableToSaleRow),
      danfseFilename: "nota.pdf",
    };
  }
  return salesFromLatestVendaEvent(token, clienteId, lookbackDays);
}
