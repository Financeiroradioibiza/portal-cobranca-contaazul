import type { ExternalAutoTag } from "@/lib/criacao/tagEnrichmentCore";

export const EXPLICIT_TAG_FONTE = "moderacao";
export const EXPLICIT_TAG_CHAVE = "explicit";
export const EXPLICIT_TAG_VALOR = "EXP";
export const EXPLICIT_CHECKED_VALOR = "OK";
export const EXPLICIT_API_SIM = "sim";
export const EXPLICIT_API_NAO = "nao";
export const EXPLICIT_API_DESCONHECIDA = "desconhecida";

export type ExplicitApiStatus = "sim" | "nao" | "desconhecida" | null;

export function extractExplicitApiStatus(
  tags: ExternalAutoTag[],
  fonte: "deezer" | "musicbrainz" | "gemini",
): ExplicitApiStatus {
  const hit = tags.find((t) => t.fonte === fonte && t.chave === EXPLICIT_TAG_CHAVE);
  if (!hit) return null;
  if (hit.valor === EXPLICIT_API_SIM) return "sim";
  if (hit.valor === EXPLICIT_API_NAO) return "nao";
  if (hit.valor === EXPLICIT_API_DESCONHECIDA) return "desconhecida";
  return null;
}

/** Chip vermelho EXP — só veredicto Gemini (3ª camada). */
export function isGeminiExplicitTagged(tags: ExternalAutoTag[]): boolean {
  return extractExplicitApiStatus(tags, "gemini") === "sim";
}

export function hasApiExplicitCheck(tags: ExternalAutoTag[]): boolean {
  const ok = (fonte: "deezer" | "musicbrainz") => {
    const s = extractExplicitApiStatus(tags, fonte);
    return s === "sim" || s === "nao";
  };
  return ok("deezer") && ok("musicbrainz");
}

export function hasGeminiExplicitCheck(tags: ExternalAutoTag[]): boolean {
  return extractExplicitApiStatus(tags, "gemini") !== null;
}

/** Faixa ainda precisa de check IA (nunca feito ou veredicto desatualizado vs Deezer/MB). */
export function needsGeminiExplicitCheck(tags: ExternalAutoTag[]): boolean {
  const gemini = extractExplicitApiStatus(tags, "gemini");
  if (gemini === null) return true;
  const deezer = extractExplicitApiStatus(tags, "deezer");
  const musicbrainz = extractExplicitApiStatus(tags, "musicbrainz");
  return finalizeGeminiExplicitVerdict(gemini, deezer, musicbrainz) !== gemini;
}

/** Deezer/MB já marcam explicit — não precisa esperar Gemini (evita 504 Netlify). */
export function canConfirmExplicitFromApis(
  deezer: ExplicitApiStatus,
  musicbrainz: ExplicitApiStatus,
): boolean {
  return deezer === "sim" || musicbrainz === "sim";
}

/** Combina veredicto Gemini com sinais Deezer/MB (explicit_lyrics). */
export function finalizeGeminiExplicitVerdict(
  gemini: "sim" | "nao" | "desconhecida",
  deezer: ExplicitApiStatus,
  musicbrainz: ExplicitApiStatus,
): "sim" | "nao" | "desconhecida" {
  if (gemini === "sim") return "sim";
  if (deezer === "sim" || musicbrainz === "sim") return "sim";
  return gemini;
}

function stripApiExplicit(tags: ExternalAutoTag[]): ExternalAutoTag[] {
  return tags.filter(
    (t) => !((t.fonte === "deezer" || t.fonte === "musicbrainz") && t.chave === EXPLICIT_TAG_CHAVE),
  );
}

function stripGeminiExplicit(tags: ExternalAutoTag[]): ExternalAutoTag[] {
  return tags.filter((t) => {
    if (t.fonte === "gemini" && t.chave === EXPLICIT_TAG_CHAVE) return false;
    if (t.fonte === EXPLICIT_TAG_FONTE && t.chave === EXPLICIT_TAG_CHAVE) return false;
    return true;
  });
}


/** Camadas 1–2: Deezer + MusicBrainz — não mexe em Gemini/EXP. */
export function mergeApiExplicitCheck(
  tags: ExternalAutoTag[],
  input: { deezer: boolean | null; musicbrainz: boolean | null },
): ExternalAutoTag[] {
  const out = stripApiExplicit(tags);
  const dz =
    input.deezer === null ? EXPLICIT_API_DESCONHECIDA
    : input.deezer ? EXPLICIT_API_SIM
    : EXPLICIT_API_NAO;
  const mb =
    input.musicbrainz === null ? EXPLICIT_API_DESCONHECIDA
    : input.musicbrainz ? EXPLICIT_API_SIM
    : EXPLICIT_API_NAO;
  out.push({ fonte: "deezer", chave: EXPLICIT_TAG_CHAVE, valor: dz });
  out.push({ fonte: "musicbrainz", chave: EXPLICIT_TAG_CHAVE, valor: mb });
  return out;
}

/** Camada 3: Gemini — só grava tags gemini + moderacao; não mexe em Deezer/MB. */
export function mergeGeminiExplicitCheck(
  tags: ExternalAutoTag[],
  geminiTag: "sim" | "nao" | "desconhecida",
): ExternalAutoTag[] {
  const out = stripGeminiExplicit(tags);
  out.push({ fonte: "gemini", chave: EXPLICIT_TAG_CHAVE, valor: geminiTag });
  out.push({
    fonte: EXPLICIT_TAG_FONTE,
    chave: EXPLICIT_TAG_CHAVE,
    valor: geminiTag === "sim" ? EXPLICIT_TAG_VALOR : EXPLICIT_CHECKED_VALOR,
  });
  return out;
}

function tagsSignature(tags: ExternalAutoTag[]): string {
  return [...tags]
    .map((t) => `${t.fonte}|${t.chave ?? ""}|${t.valor}`)
    .sort()
    .join(";");
}

export function explicitTagsChanged(before: ExternalAutoTag[], after: ExternalAutoTag[]): boolean {
  return tagsSignature(before) !== tagsSignature(after);
}

/** @deprecated use isGeminiExplicitTagged */
export function isExplicitTagged(tags: ExternalAutoTag[]): boolean {
  return isGeminiExplicitTagged(tags);
}

/** @deprecated use hasGeminiExplicitCheck */
export function hasExplicitCheckTag(tags: ExternalAutoTag[]): boolean {
  return hasGeminiExplicitCheck(tags);
}
