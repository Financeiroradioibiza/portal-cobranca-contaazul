const localePtBr = { sensitivity: "base" } as const;

/** Ordenação alfabética de MARCA/grupo (pt-BR). */
export function compareRioGruposByNome(
  a: { nome: string; id?: string },
  b: { nome: string; id?: string },
): number {
  const byNome = a.nome.localeCompare(b.nome, "pt-BR", localePtBr);
  if (byNome !== 0) return byNome;
  if (a.id && b.id) return a.id.localeCompare(b.id);
  return 0;
}

type GrupoComOrdem = {
  id: string;
  nome: string;
  sortOrder: number;
  systemTag?: string | null;
};

/** Blocos sistema (virada) primeiro; demais MARCAs em A–Z. */
export function sortRioCompGruposForDisplay<T extends GrupoComOrdem>(grupos: T[]): T[] {
  const system = grupos
    .filter((g) => g.systemTag)
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || compareRioGruposByNome(a, b),
    );
  const user = grupos.filter((g) => !g.systemTag).sort(compareRioGruposByNome);
  return [...system, ...user];
}

/** Ordenação alfabética de clientes na Planilha Rio (pt-BR). */
export function compareRioLinhasByNomeFantasia(
  a: { nomeFantasia: string; id?: string },
  b: { nomeFantasia: string; id?: string },
): number {
  const byNome = a.nomeFantasia.localeCompare(b.nomeFantasia, "pt-BR", localePtBr);
  if (byNome !== 0) return byNome;
  if (a.id && b.id) return a.id.localeCompare(b.id);
  return 0;
}
