/** Bloco texto plano de `{{DOCUMENTOS}}` (mesmo texto no multipart alternative `text`). */
export function textoIntroDocumentosCliente(hasLinksBoleto: boolean): string {
  return hasLinksBoleto
    ? "Links dos boletos (quando houver fatura digital e banco, aparecem as duas linhas):"
    : "Links adicionais:";
}

export function textoRodapeDocumentosCliente(): string {
  return "Os PDFs podem já estar em anexo; use os URLs no browser quando precisar.";
}

export function buildMinimalDocumentosVar(linkLines: string[]): string {
  if (linkLines.length === 0) return "";
  const hasBoleto = linkLines.some((l) => /boleto/i.test(l));
  return [
    textoIntroDocumentosCliente(hasBoleto),
    "",
    ...linkLines,
    "",
    textoRodapeDocumentosCliente(),
  ].join("\n");
}
