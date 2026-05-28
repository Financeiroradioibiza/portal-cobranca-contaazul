import { formatMoneyBr, parseMoneyBr } from "@/lib/rio/valorClienteCalc";

export type RioLinhaTotalsInput = {
  movimento: string;
  valorClienteTexto: string;
  numeroPdvSite: number;
};

function linhaAtiva(movimento: string): boolean {
  return movimento !== "saida";
}

/** Soma valor (coluna Valor), Nº PDV e clientes ativos (exclui movimento saída). */
export function sumRioLinhasTotals(linhas: RioLinhaTotalsInput[]) {
  let valorTotal = 0;
  let valorHasAny = false;
  let pdvTotal = 0;
  let clientesAtivos = 0;

  for (const l of linhas) {
    if (!linhaAtiva(l.movimento)) continue;
    clientesAtivos += 1;
    const v = parseMoneyBr(l.valorClienteTexto);
    if (v != null) {
      valorTotal += v;
      valorHasAny = true;
    }
    pdvTotal += Math.max(0, l.numeroPdvSite ?? 0);
  }

  return { valorTotal, valorHasAny, pdvTotal, clientesAtivos };
}

export function formatRioValorTotal(hasAny: boolean, total: number): string {
  return hasAny ? formatMoneyBr(total) : "—";
}
