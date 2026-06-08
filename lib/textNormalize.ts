/** Utilitários de texto sem dependência Node — seguros em Client Components. */

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

export function normalizeSearch(s: string): string {
  return stripDiacritics(s.trim().toLowerCase()).replace(/\s+/g, " ");
}

/** Remove pontuação forte para fuzzy match */
export function compactAlphaNum(s: string): string {
  return normalizeSearch(s).replace(/[^\p{L}\p{N}]+/gu, "");
}

export function tokenize(term: string): string[] {
  const n = normalizeSearch(term);
  return n.split(/\s+/).filter((t) => {
    const c = compactAlphaNum(t);
    return c.length >= 2;
  });
}

/** Todos tokens (>=2 caracteres cada) devem aparecer no texto compactado */
export function fuzzyContainsAllHaystack(blobC: string, tokens: string[]): boolean {
  if (tokens.length === 0) return blobC.length >= 2;
  return tokens.every((t) => blobC.includes(compactAlphaNum(t)));
}
