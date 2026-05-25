import { formatBRL } from "@/lib/format";
import type { SaleRow } from "@/lib/types";

function pickVenda(raw: string): string | null {
  const m = raw.match(/\bVenda\s*[:\s\/]*\s*([0-9A-Za-z]+)/i);
  return m?.[1]?.trim() ?? null;
}

function pickNfse(raw: string): string | null {
  for (const re of [
    /\bnfs-e\s*[:\s#]+\s*([0-9]+)/i,
    /\bnf\s*[-_]?\s*se\s*[:\s#]+\s*([0-9]+)/i,
    /\bNF[S]?\s*[-_]?\s*e\s*[:\s#]+\s*([0-9]+)/i,
    /\bnf\s*de\s*servico\s*[:\s#]+\s*([0-9]+)/i,
  ]) {
    const m = raw.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function pickRps(raw: string): string | null {
  const m = raw.match(/\bRPS\s*[:\s#]*\s*([0-9]+)/i);
  return m?.[1]?.trim() ?? null;
}

/**
 * Tenta ler Venda / NFS-e / RPS na descrição da parcela; se houver dados, formato 6 colunas → tabela bonita no HTML.
 */
export function parcelaLinhaCsvParaEmail(row: SaleRow): string {
  const raw = `${row.summary ?? ""}`.trim();
  const venda = pickVenda(raw);
  const nfse = pickNfse(raw);
  const rps = pickRps(raw);

  const valor = formatBRL(row.value);

  if (venda || nfse || rps) {
    return `- ${row.comp.trim()} | Vencimento: ${row.due.trim()} | Venda: ${venda ?? "—"} | NFS-e: ${nfse ?? "—"} | RPS: ${rps ?? "—"} | ${valor}`;
  }

  const resumo = raw || "—";
  return `- ${row.comp.trim()} | Vencimento: ${row.due.trim()} | ${resumo} | ${valor}`;
}
