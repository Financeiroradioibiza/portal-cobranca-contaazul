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

/** Total do cliente = valor unitário × quantidade de PDVs. */
export function valorClienteTextoFromPdvUnit(
  valorPdvUnitarioTexto: string,
  numeroPdvSite: number,
): string {
  const unit = parseMoneyBr(valorPdvUnitarioTexto);
  if (unit == null || numeroPdvSite <= 0) return "";
  return formatMoneyBr(unit * numeroPdvSite);
}
