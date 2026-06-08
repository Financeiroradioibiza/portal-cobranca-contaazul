const DEFAULT_BASE = "https://painel.radioibiza.com.br";

export function painelPublicBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_RADIO_PAINEL_BASE_URL?.trim() ||
    process.env.RADIO_PAINEL_BASE_URL?.trim() ||
    DEFAULT_BASE;
  return raw.replace(/\/$/, "");
}

export function painelPdvEditUrl(pdvId: string | number, clienteId: string | number): string {
  return `${painelPublicBaseUrl()}/adm/pdv/edit?pdv=${pdvId}&cliente=${clienteId}`;
}

export function painelClienteEditUrl(clienteId: string | number): string {
  return `${painelPublicBaseUrl()}/adm/clientes/edit?cliente=${clienteId}`;
}
