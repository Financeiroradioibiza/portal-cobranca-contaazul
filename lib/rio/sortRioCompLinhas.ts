/** Ordenação alfabética de clientes na Planilha Rio (pt-BR). */
export function compareRioLinhasByNomeFantasia(
  a: { nomeFantasia: string; id?: string },
  b: { nomeFantasia: string; id?: string },
): number {
  const byNome = a.nomeFantasia.localeCompare(b.nomeFantasia, "pt-BR", {
    sensitivity: "base",
  });
  if (byNome !== 0) return byNome;
  if (a.id && b.id) return a.id.localeCompare(b.id);
  return 0;
}
