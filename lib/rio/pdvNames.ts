import { normalizeBrazilianTaxIdForStorage, onlyDigits } from "@/lib/format";

const MIME_ONE = "application/x-rio-pdv-nome";
const MIME_BULK = "application/x-rio-pdv-bulk";

export type ParsedPdvRow = { nome: string; documento: string | null };

const CNPJ_MASKED_AT_END_RE = /^(.+?)[\s\t]+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/;
const DIGITS_AT_END_RE = /^(.+?)[\s\t]+(\d{11,14})$/;

function looksLikeTaxId(s: string): boolean {
  const d = onlyDigits(s);
  return d.length === 11 || d.length === 14;
}

function normalizePdvPasteLine(line: string): string {
  return line.replace(/\u00a0/g, " ").trim();
}

/** Uma linha colada: «Nome do PDV» + tab/espaços + CNPJ/CPF (opcional). */
export function parseSinglePdvPasteLine(line: string): ParsedPdvRow | null {
  const trimmed = normalizePdvPasteLine(line);
  if (!trimmed) return null;

  if (trimmed.includes("\t")) {
    const parts = trimmed.split("\t").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const tail = parts[parts.length - 1];
      if (looksLikeTaxId(tail)) {
        const nome = parts.slice(0, -1).join(" ").trim();
        if (nome) {
          return {
            nome,
            documento: normalizeBrazilianTaxIdForStorage(tail),
          };
        }
      }
    }
  }

  const masked = trimmed.match(CNPJ_MASKED_AT_END_RE);
  if (masked?.[1]?.trim()) {
    return {
      nome: masked[1].trim(),
      documento: normalizeBrazilianTaxIdForStorage(masked[2]),
    };
  }

  const digits = trimmed.match(DIGITS_AT_END_RE);
  if (digits?.[1]?.trim() && looksLikeTaxId(digits[2])) {
    return {
      nome: digits[1].trim(),
      documento: normalizeBrazilianTaxIdForStorage(digits[2]),
    };
  }

  return { nome: trimmed, documento: null };
}

/** Várias linhas (colar no cliente expandido ou arrastar do Excel). */
export function parsePdvRowsFromMultilineText(text: string): ParsedPdvRow[] {
  const seen = new Set<string>();
  const out: ParsedPdvRow[] = [];

  for (const line of text.split(/\r?\n/)) {
    const row = parseSinglePdvPasteLine(line);
    if (!row?.nome) continue;
    const key = row.nome.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out.sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
  );
}

/** Compat: só nomes (sem CNPJ). */
export function parsePdvNamesFromMultilineText(text: string): string[] {
  return parsePdvRowsFromMultilineText(text).map((r) => r.nome);
}

export function sortPdvNamesAlphabetically(names: string[]): string[] {
  return [...names].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
  );
}

/** Lê PDVs soltos na zona do cliente (arrastar ou colar). */
export function readPdvDropFromDataTransfer(dt: DataTransfer): ParsedPdvRow[] {
  const bulk = dt.getData(MIME_BULK);
  if (bulk) {
    try {
      const parsed = JSON.parse(bulk) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((x): x is string => typeof x === "string")
          .map((nome) => ({ nome: nome.trim(), documento: null }))
          .filter((r) => r.nome.length > 0);
      }
    } catch {
      /* ignore */
    }
  }
  const one = dt.getData(MIME_ONE).trim();
  if (one) {
    const row = parseSinglePdvPasteLine(one);
    return row ? [row] : [{ nome: one, documento: null }];
  }
  const plain = dt.getData("text/plain").trim();
  if (!plain) return [];
  if (plain.includes("\n")) return parsePdvRowsFromMultilineText(plain);
  const single = parseSinglePdvPasteLine(plain);
  return single ? [single] : [{ nome: plain, documento: null }];
}

export function sortRioPdvsByNome<T extends { id: string; nome: string }>(pdvs: T[]): T[] {
  return [...pdvs].sort(
    (a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }) ||
      a.id.localeCompare(b.id),
  );
}
