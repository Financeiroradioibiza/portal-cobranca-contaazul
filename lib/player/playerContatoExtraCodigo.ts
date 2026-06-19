/** Códigos literais do cadastro legado («contato extra») — Player 5 → aviso vermelho. */
export type PlayerContatoExtraCodigo = "" | "ALERTACORTE" | "CADASTRO";

const ALLOWED = new Set<string>(["ALERTACORTE", "CADASTRO"]);

export function normalizePlayerContatoExtraCodigo(raw: unknown): PlayerContatoExtraCodigo {
  const t = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (t === "ALERTACORTE" || t === "CADASTRO") return t;
  return "";
}

export function isPlayerContatoExtraCodigo(raw: unknown): raw is PlayerContatoExtraCodigo {
  const n = normalizePlayerContatoExtraCodigo(raw);
  return n === "ALERTACORTE" || n === "CADASTRO";
}
