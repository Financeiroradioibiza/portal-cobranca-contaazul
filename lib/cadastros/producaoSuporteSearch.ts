import type { SuportePdvRow } from "@/lib/cadastros/producaoSuporteTypes";
import { onlyDigits } from "@/lib/format";
import { formatPortalPdvIdDisplay } from "@/lib/player/portalPlayerIds";

export function matchesSuporteSearch(row: SuportePdvRow, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;

  const cnpjDigits = onlyDigits(needle);
  if (cnpjDigits.length >= 4) {
    const rowDigits = onlyDigits(row.cnpj);
    if (rowDigits.includes(cnpjDigits)) return true;
  }

  if (/^\d+$/.test(q)) {
    if (row.portalPdvId != null && String(row.portalPdvId).includes(q)) return true;
    if (row.portalClienteId != null && String(row.portalClienteId).includes(q)) return true;
  }

  if (q.includes(".")) {
    if (row.portalPdvId != null && formatPortalPdvIdDisplay(row.portalPdvId).includes(q)) return true;
  }

  return (
    row.nome.toLowerCase().includes(q) ||
    row.clienteNome.toLowerCase().includes(q) ||
    (row.clienteLoginEmail?.toLowerCase().includes(q) ?? false) ||
    (row.programacaoCriacaoNome?.toLowerCase().includes(q) ?? false)
  );
}
