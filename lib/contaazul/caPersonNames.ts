function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Conta Azul v1 (GET /v1/pessoas/{id}):
 * - `nome_empresa` = razão social (ex.: "M6 COMERCIO DE CONFECCOES LTDA")
 * - `nome` = nome exibido na listagem / fantasia da loja (ex.: "HERING SHOPPING SAO JOSE")
 * @see https://developers.contaazul.com/open-api-docs/open-api-person/v1/retornapessoaporid
 */
export function razaoSocialFromCaPersonRaw(raw: unknown): string {
  const row = asRecord(raw);
  if (!row) return "";
  return (
    str(row.nome_empresa) ||
    str(row.razao_social) ||
    str(row.razaoSocial) ||
    str(row.nome) ||
    ""
  );
}

export function nomeFantasiaFromCaPersonRaw(raw: unknown, fallback = ""): string {
  const row = asRecord(raw);
  if (!row) return fallback.trim();
  const fantasia =
    str(row.nome_fantasia) ||
    str(row.nomeFantasia) ||
    str(row.nome) ||
    str(row.name) ||
    "";
  if (fantasia) return fantasia;
  const fb = fallback.trim();
  if (fb) return fb;
  return str(row.nome_empresa) || "";
}
