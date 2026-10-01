import { normalizeConversaSlug } from "@/lib/chamados/chamadoMentions";

export type ClienteConversaPapel = "sup" | "mus";

export function clienteCanalSlug(clienteKey: string, papel: ClienteConversaPapel): string {
  return normalizeConversaSlug(`cliente-${clienteKey}-${papel}`);
}

/** Nome curto para rótulo (#Sup_Agilita). */
export function clienteCanalNomeCurto(nome: string): string {
  const t = nome.trim().replace(/\s+/g, "_").replace(/[^\w\-À-ú]/gi, "");
  return t.slice(0, 36) || "Cliente";
}

export function clienteCanalDisplay(nome: string, papel: ClienteConversaPapel): string {
  const curto = clienteCanalNomeCurto(nome);
  return papel === "sup" ? `#Sup_${curto}` : `#Mus_${curto}`;
}

export function parseClientePapel(raw: string | null | undefined): ClienteConversaPapel | null {
  if (raw === "sup" || raw === "mus") return raw;
  return null;
}

export function inferClientePapelFromSlug(slug: string): ClienteConversaPapel | null {
  const s = slug.toLowerCase();
  if (s.endsWith("-mus")) return "mus";
  if (s.endsWith("-sup")) return "sup";
  return null;
}
