import type { ClientRow, SaleRow } from "@/lib/types";
import type { CaReceivableItem } from "./types";
import { isPastDueOpen } from "./types";

function formatDocumento(raw?: string | null) {
  if (!raw?.trim()) return "—";
  return raw.trim();
}

/**
 * Agrega parcelas em clientes, apenas vencidas em aberto, ordenado por quantidade de parcelas.
 */
export function buildDashboardClients(
  items: CaReceivableItem[],
  people: Map<
    string,
    { id: string; nome: string; documento?: string | null; email?: string | null }
  >,
): ClientRow[] {
  const filtered = items.filter(isPastDueOpen);
  const byClient = new Map<string, CaReceivableItem[]>();

  for (const it of filtered) {
    const cid = it.cliente?.id;
    if (!cid) continue;
    const arr = byClient.get(cid) ?? [];
    arr.push(it);
    byClient.set(cid, arr);
  }

  const rows: ClientRow[] = [];

  for (const [clientId, parcelas] of byClient) {
    const p = people.get(clientId);
    const fantasy =
      p?.nome?.trim() || parcelas[0]?.cliente?.nome?.trim() || "Cliente";

    const sales: SaleRow[] = parcelas.map((s) => {
      const explicit = s.id_parcela?.trim() || s.idParcela?.trim();
      const parcelaId = explicit || s.id.trim();
      return {
        id: parcelaId,
        comp: s.data_competencia?.slice(0, 10) ?? "—",
        due: s.data_vencimento?.slice(0, 10) ?? "—",
        summary: s.descricao ?? "—",
        value: s.nao_pago,
      };
    });

    rows.push({
      id: clientId,
      fantasy,
      cnpj: formatDocumento(p?.documento),
      email: p?.email?.trim() || "—",
      activeContractNumbers: null,
      note: "",
      sales,
    });
  }

  rows.sort((a, b) => b.sales.length - a.sales.length);
  return rows;
}

export type RioOpenClientSummary = {
  id: string;
  fantasy: string;
  cnpj: string;
  email: string;
  parcelasAbertas: number;
  totalAberto: number;
};

/**
 * Clientes com saldo **em aberto** em pelo menos uma parcela (entre os eventos já filtrados pela API CA).
 * Diferente do painel cobrança, **não** exige estar vencida — apenas `nao_pago > 0`.
 */
export function buildRioOpenBalanceClients(
  items: CaReceivableItem[],
  people: Map<
    string,
    { id: string; nome: string; documento?: string | null; email?: string | null }
  >,
): RioOpenClientSummary[] {
  const filtered = items.filter((it) => {
    const n = typeof it.nao_pago === "number" ? it.nao_pago : NaN;
    return Boolean(it.cliente?.id) && Number.isFinite(n) && n > 0;
  });
  const byClient = new Map<string, CaReceivableItem[]>();

  for (const it of filtered) {
    const cid = String(it.cliente?.id ?? "");
    if (!cid.length) continue;
    const arr = byClient.get(cid) ?? [];
    arr.push(it);
    byClient.set(cid, arr);
  }

  const rows: RioOpenClientSummary[] = [];

  for (const [clientId, parcelas] of byClient) {
    const p = people.get(clientId);
    const fantasy = p?.nome?.trim() || parcelas[0]?.cliente?.nome?.trim() || "Cliente";

    rows.push({
      id: clientId,
      fantasy,
      cnpj: formatDocumento(p?.documento),
      email: !p?.email?.trim() ? "—" : p.email.trim(),
      parcelasAbertas: parcelas.length,
      totalAberto: parcelas.reduce((s, x) => s + (typeof x.nao_pago === "number" ? x.nao_pago : 0), 0),
    });
  }

  rows.sort((a, b) => b.parcelasAbertas - a.parcelasAbertas);
  return rows;
}
