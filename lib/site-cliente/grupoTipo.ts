export type SiteClienteGrupoTipo = "producao" | "cobranca";

export const SITE_CLIENTE_GRUPO_TIPO_LABELS: Record<SiteClienteGrupoTipo, string> = {
  producao: "Produção",
  cobranca: "Cobrança",
};

export function parseSiteClienteGrupoTipo(raw: unknown): SiteClienteGrupoTipo {
  return raw === "cobranca" ? "cobranca" : "producao";
}

/** CA person id válido para ponte cobrança (não placeholder de import). */
export function isSiteClienteCaPersonIdLinkable(caPersonId: string): boolean {
  const t = caPersonId.trim();
  if (t.length < 8) return false;
  if (t.startsWith("import:")) return false;
  if (t === "pending") return false;
  return true;
}
