/** Parse valor monetário (pt-BR ou número simples). */
export function parseMoneyBr(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const cleaned = t
    .replace(/[R$\s]/gi, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function formatMoneyBr(n: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Valor da coluna «Valor» após sync/atualização CA: usa contrato ou cadastro CA quando existir;
 * senão mantém o que já está na planilha (cobrança manual sem contrato).
 */
export function mergeValorClienteFromContaAzul(
  valorAtualNaPlanilha: string,
  valorDoContratoCa: string | null | undefined,
  valorDoCadastroCa: string | null | undefined,
): string {
  const contrato = (valorDoContratoCa ?? "").trim();
  if (contrato) return contrato.slice(0, 200);
  const cadastro = (valorDoCadastroCa ?? "").trim();
  if (cadastro) return cadastro.slice(0, 200);
  return valorAtualNaPlanilha.trim().slice(0, 200);
}

/** Total do cliente = valor unitário × quantidade de PDVs. */
export function valorClienteTextoFromPdvUnit(
  valorPdvUnitarioTexto: string,
  numeroPdvSite: number,
): string {
  const unit = parseMoneyBr(valorPdvUnitarioTexto);
  if (unit == null || numeroPdvSite <= 0) return "";
  return formatMoneyBr(unit * numeroPdvSite);
}
