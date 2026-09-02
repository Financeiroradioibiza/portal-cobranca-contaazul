import type { ExternalAutoTag } from "@/lib/criacao/tagEnrichmentCore";

export const GENIUS_FONTE = "genius";
export const GENIUS_LETRA_VERIFICADA_CHAVE = "letra_verificada";
export const GENIUS_LETRA_VERIFICADA_VALOR = "sim";
export const GENIUS_LETRA_EXPLICIT_CHAVE = "letra_explicit";
export const GENIUS_LETRA_EXPLICIT_SIM = "sim";
export const GENIUS_LETRA_EXPLICIT_NAO = "nao";

export type GeniusLetraStatus = "sim" | "nao" | null;

/** Selo só existe quando a letra foi encontrada e analisada. */
export function hasGeniusLetraVerificada(tags: ExternalAutoTag[]): boolean {
  return tags.some(
    (t) =>
      t.fonte === GENIUS_FONTE &&
      t.chave === GENIUS_LETRA_VERIFICADA_CHAVE &&
      t.valor === GENIUS_LETRA_VERIFICADA_VALOR,
  );
}

export function extractGeniusLetraExplicit(tags: ExternalAutoTag[]): GeniusLetraStatus {
  if (!hasGeniusLetraVerificada(tags)) return null;
  const hit = tags.find(
    (t) => t.fonte === GENIUS_FONTE && t.chave === GENIUS_LETRA_EXPLICIT_CHAVE,
  );
  if (!hit) return null;
  if (hit.valor === GENIUS_LETRA_EXPLICIT_SIM) return "sim";
  if (hit.valor === GENIUS_LETRA_EXPLICIT_NAO) return "nao";
  return null;
}

export function needsGeniusLetraCheck(tags: ExternalAutoTag[]): boolean {
  return !hasGeniusLetraVerificada(tags);
}

function stripGeniusLetra(tags: ExternalAutoTag[]): ExternalAutoTag[] {
  return tags.filter(
    (t) =>
      !(
        t.fonte === GENIUS_FONTE &&
        (t.chave === GENIUS_LETRA_VERIFICADA_CHAVE || t.chave === GENIUS_LETRA_EXPLICIT_CHAVE)
      ),
  );
}

/** Grava selo positivo ou negativo — só chamar quando a letra foi encontrada. */
export function mergeGeniusLetraCheck(
  tags: ExternalAutoTag[],
  explicit: boolean,
): ExternalAutoTag[] {
  const out = stripGeniusLetra(tags);
  out.push({
    fonte: GENIUS_FONTE,
    chave: GENIUS_LETRA_VERIFICADA_CHAVE,
    valor: GENIUS_LETRA_VERIFICADA_VALOR,
  });
  out.push({
    fonte: GENIUS_FONTE,
    chave: GENIUS_LETRA_EXPLICIT_CHAVE,
    valor: explicit ? GENIUS_LETRA_EXPLICIT_SIM : GENIUS_LETRA_EXPLICIT_NAO,
  });
  return out;
}

function tagsSignature(tags: ExternalAutoTag[]): string {
  return [...tags]
    .map((t) => `${t.fonte}|${t.chave ?? ""}|${t.valor}`)
    .sort()
    .join(";");
}

export function geniusLetraTagsChanged(before: ExternalAutoTag[], after: ExternalAutoTag[]): boolean {
  return tagsSignature(before) !== tagsSignature(after);
}
