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

  const extras = row.contatosLojaExtras ?? [];
  const extraHit = extras.some(
    (e) =>
      e.nome.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      e.telefone.toLowerCase().includes(q),
  );

  if (
    row.nome.toLowerCase().includes(q) ||
    row.clienteNome.toLowerCase().includes(q) ||
    (row.clienteLoginEmail?.toLowerCase().includes(q) ?? false) ||
    (row.programacaoCriacaoNome?.toLowerCase().includes(q) ?? false) ||
    row.contatoLojaNome.toLowerCase().includes(q) ||
    row.contatoLojaEmail.toLowerCase().includes(q) ||
    row.contatoLojaTelefone.toLowerCase().includes(q) ||
    extraHit
  ) {
    return true;
  }

  const words = q.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return false;

  const hay = [
    row.nome,
    row.clienteNome,
    row.clienteLoginEmail ?? "",
    row.programacaoCriacaoNome ?? "",
    row.contatoLojaNome,
    row.contatoLojaEmail,
    row.contatoLojaTelefone,
    ...extras.flatMap((e) => [e.nome, e.email, e.telefone]),
  ]
    .join(" ")
    .toLowerCase();

  return words.every((w) => hay.includes(w));
}
