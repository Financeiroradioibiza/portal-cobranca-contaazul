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

function rioNomeVariants(rioPdvNome: string, rioClienteNome: string): string[] {
  const out = new Set<string>();
  const add = (raw: string) => {
    const cleaned = cleanRioNomeForMatch(raw).trim();
    if (cleaned.length >= 3) out.add(cleaned);
    const head = cleaned.split(/\s*[-–—]\s*/)[0]?.trim() ?? "";
    if (head.length >= 3) out.add(head);
  };
  add(rioPdvNome);
  if (rioClienteNome.trim() && rioClienteNome.trim() !== rioPdvNome.trim()) {
    add(rioClienteNome);
  }
  return [...out];
}

function significantTokens(s: string): string[] {
  return tokenize(s)
    .map((t) => compactAlphaNum(t))
    .filter((t) => t.length >= 3 && !MATCH_STOP_WORDS.has(t));
}

function nomePdvScore(rioNome: string, painelNome: string): number {
  const a = compactAlphaNum(rioNome);
  const b = compactAlphaNum(painelNome);
  if (!a || !b) return 0;
  if (a === b) return 95;
  if (a.includes(b) || b.includes(a)) return 78;
  const aTok = significantTokens(rioNome);
  const hits = aTok.filter((t) => b.includes(t)).length;
  if (!aTok.length) return 0;
  return Math.round(55 + (hits / aTok.length) * 30);
}

/** Similaridade por conjunto de palavras (ordem irrelevante). */
function tokenBagScore(a: string, b: string): number {
  const ta = significantTokens(a);
  const tb = significantTokens(b);
  if (!ta.length || !tb.length) return 0;

  let hits = 0;
  for (const t of ta) {
    if (tb.some((u) => u === t || (t.length >= 4 && u.includes(t)) || (u.length >= 4 && t.includes(u)))) {
      hits += 1;
    }
  }

  const denom = Math.min(ta.length, tb.length);
  if (!denom) return 0;
  const ratio = hits / denom;
  if (ratio >= 1) return 92;
  if (ratio >= 0.66) return Math.round(72 + ratio * 18);
  return Math.round(50 + ratio * 30);
}

function bestPainelMatch(
  rioPdvNome: string,
  rioClienteNome: string,
  rec: CsvPdvRecord,
): { score: number; method: PainelMatchMethod } | null {
  const parts: Array<{ score: number; method: PainelMatchMethod }> = [];

  const pdvDirect = nomePdvScore(rioPdvNome, rec.pdvNome);
  if (pdvDirect >= 50) parts.push({ score: pdvDirect, method: "nome_pdv" });

  const pdvFromCliente = nomePdvScore(rioClienteNome, rec.pdvNome);
  if (pdvFromCliente >= 50) parts.push({ score: pdvFromCliente, method: "nome_pdv" });

  const tokenPdv = tokenBagScore(rioPdvNome, rec.pdvNome);
  if (tokenPdv >= 55) parts.push({ score: tokenPdv, method: "nome_pdv" });

  const tokenClienteOnPdv = tokenBagScore(rioClienteNome, rec.pdvNome);
  if (tokenClienteOnPdv >= 55) parts.push({ score: tokenClienteOnPdv, method: "nome_pdv" });

  const tokenCliente = tokenBagScore(rioClienteNome, rec.nomeCliente);
  if (tokenCliente >= 55) {
    parts.push({ score: Math.min(75, tokenCliente), method: "nome_cliente" });
  }

  const tokenCross = tokenBagScore(rioPdvNome, rec.nomeCliente);
  if (tokenCross >= 55) {
    parts.push({ score: Math.min(72, tokenCross), method: "nome_cliente" });
  }

  if (!parts.length) return null;
  return parts.sort((x, y) => y.score - x.score)[0]!;
}

function collectPainelCandidates(
  rioPdvNome: string,
  rioClienteNome: string,
): Map<string, CsvPdvRecord> {
  const variants = rioNomeVariants(rioPdvNome, rioClienteNome);
  const cand = new Map<string, CsvPdvRecord>();

  const addRec = (rec: CsvPdvRecord | null) => {
    if (!rec) return;
    cand.set(rec.pdvId, rec);
  };

  for (const term of variants) {
    for (const hit of csvMatchPdvsPorTexto(term)) {
      addRec(csvGetPdvByPainelId(hit.pdvId));
    }
  }

  const tokens = variants.flatMap((v) => significantTokens(v));
  for (const rec of csvFindPdvsByAnyToken(tokens)) {
    addRec(rec);
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

  const rioPdvNome = cleanRioNomeForMatch(input.rioPdvNome);
  const rioClienteNome = cleanRioNomeForMatch(input.rioClienteNome);

  const doc = input.rioDocumento ? onlyDigits(input.rioDocumento) : "";
  if (doc.length === 11 || doc.length === 14) {
    for (const rec of csvFindPdvsByCnpjDigits(doc)) {
      push(suggestionFromRecord(rec, "cnpj", 100));
    }
  }

  for (const [_, rec] of collectPainelCandidates(rioPdvNome, rioClienteNome)) {
    const best = bestPainelMatch(rioPdvNome, rioClienteNome, rec);
    if (!best || best.score < 50) continue;
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
