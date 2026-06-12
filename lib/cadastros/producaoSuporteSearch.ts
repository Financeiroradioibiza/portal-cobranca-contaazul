import type { SuportePdvRow } from "@/lib/cadastros/producaoSuporteTypes";
import { onlyDigits } from "@/lib/format";

export function matchesSuporteSearch(row: SuportePdvRow, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;

  const cnpjDigits = onlyDigits(needle);
  if (cnpjDigits.length >= 4) {
    const rowDigits = onlyDigits(row.cnpj);
    if (rowDigits.includes(cnpjDigits)) return true;
  }

  return row.nome.toLowerCase().includes(q) || row.clienteNome.toLowerCase().includes(q);
}
