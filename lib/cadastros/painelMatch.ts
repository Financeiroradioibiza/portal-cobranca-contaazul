import type { PainelMatchMethod } from "@prisma/client";
import { onlyDigits } from "@/lib/format";
import {
  csvFindPdvsByCnpjDigits,
  csvGetPdvByPainelId,
  csvMatchPdvsPorTexto,
  type CsvPdvRecord,
} from "@/lib/radioPainel/exportClientesCsv";
import { compactAlphaNum, normalizeSearch } from "@/lib/textNormalize";

export type PainelMatchSuggestion = {
  painelPdvId: number;
  painelClienteId: number;
  painelPdvNome: string;
  painelClienteNome: string;
  matchMethod: PainelMatchMethod;
  score: number;
  label: string;
};

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

function nomePdvScore(rioNome: string, painelNome: string): number {
  const a = compactAlphaNum(rioNome);
  const b = compactAlphaNum(painelNome);
  if (!a || !b) return 0;
  if (a === b) return 95;
  if (a.includes(b) || b.includes(a)) return 78;
  const aTok = normalizeSearch(rioNome).split(/\s+/).filter((t) => t.length >= 3);
  const hits = aTok.filter((t) => b.includes(compactAlphaNum(t))).length;
  if (!aTok.length) return 0;
  return Math.round(55 + (hits / aTok.length) * 30);
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

  const doc = input.rioDocumento ? onlyDigits(input.rioDocumento) : "";
  if (doc.length === 11 || doc.length === 14) {
    for (const rec of csvFindPdvsByCnpjDigits(doc)) {
      push(suggestionFromRecord(rec, "cnpj", 100));
    }
  }

  for (const cand of csvMatchPdvsPorTexto(input.rioPdvNome)) {
    const rec = csvGetPdvByPainelId(cand.pdvId);
    if (!rec) continue;
    const score = nomePdvScore(input.rioPdvNome, rec.pdvNome);
    if (score >= 55) {
      push(suggestionFromRecord(rec, "nome_pdv", score));
    }
  }

  if (input.rioClienteNome.trim()) {
    for (const cand of csvMatchPdvsPorTexto(`${input.rioClienteNome} ${input.rioPdvNome}`)) {
      const rec = csvGetPdvByPainelId(cand.pdvId);
      if (!rec) continue;
      const score = Math.min(72, nomePdvScore(input.rioPdvNome, rec.pdvNome) - 5);
      if (score >= 50) {
        push(suggestionFromRecord(rec, "nome_cliente", score));
      }
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 8);
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
