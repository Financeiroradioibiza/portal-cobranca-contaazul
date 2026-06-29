/** Sanitiza um segmento de path para macOS/Windows (pastas ATL CRICA). */
export function sanitizePathSegment(raw: string): string {
  const s = (raw ?? "")
    .trim()
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim();
  if (!s || s === "." || s === "..") return "_";
  return s.slice(0, 120);
}

export function buildAtlFolderPath(
  clienteNome: string,
  programacaoNome: string,
  pastaNome: string,
): string {
  return [
    sanitizePathSegment(clienteNome),
    sanitizePathSegment(programacaoNome),
    sanitizePathSegment(pastaNome),
  ].join("/");
}

/** Divide path relativo em segmentos (ignora vazio e `.`). */
export function splitRelativePath(path: string): string[] {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s && s !== ".");
}
