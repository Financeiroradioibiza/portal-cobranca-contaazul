import type { PainelMatchMethod } from "@prisma/client";
import { onlyDigits } from "@/lib/format";
import {
  csvFindPdvsByAnyToken,
  csvFindPdvsByCnpjDigits,
  csvGetPdvByPainelId,
  csvMatchPdvsPorTexto,
  type CsvPdvRecord,
} from "@/lib/radioPainel/exportClientesCsv";
import { compactAlphaNum, tokenize } from "@/lib/textNormalize";

export type PainelMatchSuggestion = {
  painelPdvId: number;
  painelClienteId: number;
  painelPdvNome: string;
  painelClienteNome: string;
  matchMethod: PainelMatchMethod;
  score: number;
  label: string;
};

/** Mínimo de similaridade para sugestões em lote (abaixo disso não aparece). */
export const BULK_SUGGEST_MIN_SCORE = 55;

export const BULK_BATCH_SIZE = 10;

const MATCH_STOP_WORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "o",
  "a",
  "os",
  "as",
  "fundo",
  "promocao",
  "promoção",
]);

/** Tokens de marca/categoria — sozinhos não distinguem lojas. */
const GENERIC_TOKENS = new Set([
  "hering",
  "shopping",
  "loja",
  "store",
  "ig",
  "center",
  "centro",
  "plaza",
  "park",
  "mall",
  "outlet",
  "f",
]);

function suggestionFromRecord(
  rec: CsvPdvRecord,
  method: PainelMatchMethod,
  score: number,
): PainelMatchSuggestion {
  return {
    painelPdvId: Number(rec.pdvId),
    painelClienteId: Number(rec.clienteId),
    painelPdvNome: rec.pdvNome,
    painelClienteNome: rec.nomeCliente,
    matchMethod: method,
    score,
    label: `${rec.pdvNome} · PDV #${rec.pdvId} · ${rec.nomeCliente} (${rec.clienteId})`,
  };
}

/** Remove sufixos de cobrança Rio que não existem no painel legado. */
function cleanRioNomeForMatch(s: string): string {
  return s
    .replace(/\s*[-–—]\s*fundo\s+de\s+promo[cç][ãa]o\s*$/i, "")
    .replace(/\s*[-–—]\s*fundo\s+promo[cç][ãa]o\s*$/i, "")
    .trim();
}

function stripNoiseForMatch(s: string): string {
  return cleanRioNomeForMatch(s)
    .replace(/\(\s*f\s*\)/gi, " ")
    .replace(/\b20\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rioPdvSearchVariants(rioPdvNome: string): string[] {
  const out = new Set<string>();
  const add = (raw: string) => {
    const cleaned = stripNoiseForMatch(raw).trim();
    if (cleaned.length >= 3) out.add(cleaned);
    const head = cleaned.split(/\s*[-–—]\s*/)[0]?.trim() ?? "";
    if (head.length >= 3) out.add(head);
  };
  add(rioPdvNome);
  return [...out];
}

function significantTokens(s: string): string[] {
  return tokenize(stripNoiseForMatch(s))
    .map((t) => compactAlphaNum(t))
    .filter((t) => t.length >= 3 && !MATCH_STOP_WORDS.has(t));
}

function distinctiveTokens(s: string): string[] {
  return significantTokens(s).filter((t) => !GENERIC_TOKENS.has(t) && t.length >= 4);
}

function tokensMatch(a: string, b: string): boolean {
  return a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b));
}

/**
 * Comparação principal: nome PDV Rio × nome PDV painel.
 * Exige cobertura simétrica de tokens e penaliza lojas só com marca genérica (HERING + SHOPPING).
 */
function pdvNomeMatchScore(rioNome: string, painelNome: string): number {
  const a = compactAlphaNum(stripNoiseForMatch(rioNome));
  const b = compactAlphaNum(stripNoiseForMatch(painelNome));
  if (!a || !b) return 0;
  if (a === b) return 98;
  if (a.includes(b) || b.includes(a)) return 92;

  const ta = significantTokens(rioNome);
  const tb = significantTokens(painelNome);
  if (!ta.length || !tb.length) return 0;

  const hitsRioInPainel = ta.filter((t) => tb.some((u) => tokensMatch(t, u))).length;
  const hitsPainelInRio = tb.filter((t) => ta.some((u) => tokensMatch(t, u))).length;
  const rioCov = hitsRioInPainel / ta.length;
  const painelCov = hitsPainelInRio / tb.length;
  const symmetric = Math.min(rioCov, painelCov);

  const distRio = distinctiveTokens(rioNome);
  const distPainel = distinctiveTokens(painelNome);

  if (distRio.length > 0) {
    const distHits = distRio.filter((t) => tb.some((u) => tokensMatch(t, u))).length;
    const distRatio = distHits / distRio.length;
    if (distRatio < 0.5) {
      return Math.round(Math.min(48, symmetric * 45));
    }
    return Math.round(58 + symmetric * 25 + distRatio * 15);
  }

  if (distPainel.length > 0) {
    const painelOnly = distPainel.filter((t) => !ta.some((u) => tokensMatch(t, u)));
    if (painelOnly.length > 0) {
      return Math.round(Math.min(52, symmetric * 50));
    }
  }

  return Math.round(50 + symmetric * 35);
}

function clienteNomeBonus(rioClienteNome: string, painelClienteNome: string): number {
  const rc = stripNoiseForMatch(rioClienteNome);
  const pc = stripNoiseForMatch(painelClienteNome);
  if (!rc || !pc) return 0;
  if (compactAlphaNum(rc) === compactAlphaNum(pc)) return 6;
  const dist = distinctiveTokens(rc);
  if (!dist.length) return 0;
  const hits = dist.filter((t) => significantTokens(pc).some((u) => tokensMatch(t, u))).length;
  if (!hits) return 0;
  return Math.min(5, Math.round((hits / dist.length) * 5));
}

function bestPainelMatch(
  rioPdvNome: string,
  rioClienteNome: string,
  rec: CsvPdvRecord,
): { score: number; method: PainelMatchMethod } | null {
  const pdvScore = pdvNomeMatchScore(rioPdvNome, rec.pdvNome);

  if (pdvScore >= 55) {
    const bonus =
      rioClienteNome.trim() && compactAlphaNum(rioClienteNome) !== compactAlphaNum(rioPdvNome) ?
        clienteNomeBonus(rioClienteNome, rec.nomeCliente)
      : 0;
    return {
      score: Math.min(100, pdvScore + bonus),
      method: "nome_pdv",
    };
  }

  if (pdvScore < 45) return null;

  const bonus = clienteNomeBonus(rioClienteNome, rec.nomeCliente);
  if (bonus <= 0) return null;

  return {
    score: Math.min(68, pdvScore + bonus),
    method: "nome_cliente",
  };
}

function collectPainelCandidates(rioPdvNome: string): Map<string, CsvPdvRecord> {
  const cand = new Map<string, CsvPdvRecord>();

  const addRec = (rec: CsvPdvRecord | null) => {
    if (!rec) return;
    cand.set(rec.pdvId, rec);
  };

  for (const term of rioPdvSearchVariants(rioPdvNome)) {
    for (const hit of csvMatchPdvsPorTexto(term)) {
      addRec(csvGetPdvByPainelId(hit.pdvId));
    }
  }

  const dist = distinctiveTokens(rioPdvNome);
  if (dist.length > 0) {
    for (const rec of csvFindPdvsByAnyToken(dist)) {
      addRec(rec);
    }
  } else {
    const sig = significantTokens(rioPdvNome).filter((t) => !GENERIC_TOKENS.has(t));
    if (sig.length >= 2) {
      for (const rec of csvFindPdvsByAnyToken(sig)) {
        addRec(rec);
      }
    }
  }

  return cand;
}

export function suggestPainelMatches(input: {
  rioPdvNome: string;
  rioDocumento: string | null;
  rioClienteNome: string;
}): PainelMatchSuggestion[] {
  const out: PainelMatchSuggestion[] = [];
  const seen = new Set<string>();

  const push = (s: PainelMatchSuggestion) => {
    const k = `${s.painelPdvId}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  };

  const rioPdvNome = stripNoiseForMatch(input.rioPdvNome);
  const rioClienteNome = stripNoiseForMatch(input.rioClienteNome);

  const doc = input.rioDocumento ? onlyDigits(input.rioDocumento) : "";
  if (doc.length === 11 || doc.length === 14) {
    for (const rec of csvFindPdvsByCnpjDigits(doc)) {
      push(suggestionFromRecord(rec, "cnpj", 100));
    }
  }

  for (const [, rec] of collectPainelCandidates(rioPdvNome)) {
    const best = bestPainelMatch(rioPdvNome, rioClienteNome, rec);
    if (!best || best.score < 55) continue;
    push(suggestionFromRecord(rec, best.method, best.score));
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 8);
}

export function filterSuggestionsForBulk(
  suggestions: PainelMatchSuggestion[],
  minScore: number = BULK_SUGGEST_MIN_SCORE,
): PainelMatchSuggestion[] {
  return suggestions
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

export function resolvePainelPdvFromIds(
  painelPdvId: number,
  painelClienteId: number,
): CsvPdvRecord | null {
  const rec = csvGetPdvByPainelId(String(painelPdvId));
  if (!rec) return null;
  if (Number(rec.clienteId) !== painelClienteId) return null;
  return rec;
}
