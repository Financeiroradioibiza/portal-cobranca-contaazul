/** Mesma lógica da Consulta Painel Ibiza: nome PDV + endereço + bairro. */
export function buildGoogleMapsFromPdvAddress(parts: {
  nome: string;
  endereco: string;
  bairro: string;
}): { query: string; url: string } {
  const query = [parts.nome, parts.endereco, parts.bairro]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
  const url =
    query ?
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "";
  return { query, url };
}
