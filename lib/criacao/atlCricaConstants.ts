/** Primeira competência operacional do ATL CRICA (Jun/2026). */
export const ATL_CRICA_MIN_COMPETENCIA = "2026-06";

export const ATL_CRICA_ORIGEM_PREFIX = "atl-crica:";

export function isAtlCricaAbertura(abertaPor: string | null | undefined): boolean {
  return Boolean(abertaPor?.startsWith(ATL_CRICA_ORIGEM_PREFIX));
}

export function atlCricaCriativoNome(abertaPor: string | null | undefined): string {
  if (!abertaPor?.startsWith(ATL_CRICA_ORIGEM_PREFIX)) return "";
  return abertaPor.slice(ATL_CRICA_ORIGEM_PREFIX.length).trim();
}
