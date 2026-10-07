import { formatBRL } from "@/lib/format";
import type { SaleRow } from "@/lib/types";
import type { CobrancaEmailLayoutHints } from "./cobrancaAbertaHtml";

function pickNfseFromSummary(raw: string): string | null {
  for (const re of [
    /\bnfs-e\s*[:\s#]+\s*([0-9]+)/i,
    /\bnf\s*[-_]?\s*se\s*[:\s#]+\s*([0-9]+)/i,
    /\bNF[S]?\s*[-_]?\s*e\s*[:\s#]+\s*([0-9]+)/i,
    /\bnf\s*de\s*servico\s*[:\s#]+\s*([0-9]+)/i,
  ]) {
    const m = raw.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

/**
 * Valor do cartão verde no e-mail boleto+NF: uma parcela/venda, não a soma de várias cobranças em aberto.
 */
export function valorCartaoBoletoNfEmail(sales: SaleRow[]): number {
  if (!sales.length) return 0;
  if (sales.length === 1) return sales[0]!.value;
  const byDue = [...sales].sort((a, b) => b.due.localeCompare(a.due));
  return byDue[0]!.value;
}

/** Metadados para cartões e bloco de anexos do template Radio Ibiza. */
export function cobrancaEmailLayoutHintsFromSales(
  fantasy: string,
  sales: SaleRow[],
): CobrancaEmailLayoutHints {
  if (!sales.length) {
    return { nomeCliente: fantasy, variant: "boleto_nf" };
  }

  const first = sales[0]!;
  const total = sales.reduce((s, x) => s + x.value, 0);
  const nf =
    pickNfseFromSummary(`${first.summary ?? ""}`) ??
    sales.map((s) => pickNfseFromSummary(`${s.summary ?? ""}`)).find(Boolean) ??
    undefined;

  const multi = sales.length > 1;

  return {
    nomeCliente: fantasy,
    competencia: multi ? `${sales.length} parcelas em aberto` : first.comp.trim(),
    vencimento: first.due.trim(),
    valor: formatBRL(multi ? total : first.value),
    numeroNf: nf ?? "—",
    variant: multi ? "cobranca_aberta" : "boleto_nf",
  };
}
