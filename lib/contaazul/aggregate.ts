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
      const parcelaId =
        s.id_parcela?.trim() || s.idParcela?.trim() || s.id.trim() || s.id;
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
      hasActiveContract: false,
      note: "",
      sales,
    });
  }

  rows.sort((a, b) => b.sales.length - a.sales.length);
  return rows;
}
