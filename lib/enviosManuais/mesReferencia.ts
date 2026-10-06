/** Competência do mês anterior (rótulo longo pt-BR), igual ao painel Vercel. */
export function mesReferenciaAnteriorLabel(ref = new Date()): string {
  const mesPassado = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  return mesPassado.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
}

export function applyMesPlaceholder(template: string, mesRef: string): string {
  return template.replace(/\{mes\}/g, mesRef);
}
