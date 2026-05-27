/** Um PDV por linha (coluna lateral ou colar no cliente). */
export function parsePdvNamesFromMultilineText(text: string): string[] {
  return sortPdvNamesAlphabetically(
    [...new Set(text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))],
  );
}

export function sortPdvNamesAlphabetically(names: string[]): string[] {
  return [...names].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
  );
}

export function sortRioPdvsByNome<T extends { id: string; nome: string }>(pdvs: T[]): T[] {
  return [...pdvs].sort(
    (a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }) ||
      a.id.localeCompare(b.id),
  );
}
