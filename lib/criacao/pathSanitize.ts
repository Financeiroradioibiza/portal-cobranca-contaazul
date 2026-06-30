/** Sanitiza um segmento de path para macOS/Windows (pastas ATL CRICA). */
export function sanitizePathSegment(raw: string): string {
  const s = (raw ?? "")
    .normalize("NFC")
    .trim()
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim();
  if (!s || s === "." || s === "..") return "_";
  return s.slice(0, 120);
}

/** Chave de comparação (NFC + minúsculas) — paths do Finder vs manifest. */
export function pathSegmentCompareKey(raw: string): string {
  return sanitizePathSegment(raw).toLowerCase();
}

/** Chave tolerante a espaços — ex. RadioIbiza ≈ Radio Ibiza. */
export function pathSegmentLooseKey(raw: string): string {
  return pathSegmentCompareKey(raw).replace(/\s/g, "");
}

/** Compara paths Cliente/Prog/Pasta segmento a segmento. */
export function atlFolderPathsMatch(a: string, b: string): boolean {
  const segsA = splitRelativePath(a).map(pathSegmentCompareKey);
  const segsB = splitRelativePath(b).map(pathSegmentCompareKey);
  if (segsA.length !== segsB.length) return false;
  return segsA.every((v, i) => v === segsB[i]);
}

export function atlFolderPathsLooseMatch(a: string, b: string): boolean {
  const segsA = splitRelativePath(a).map(pathSegmentLooseKey);
  const segsB = splitRelativePath(b).map(pathSegmentLooseKey);
  if (segsA.length !== segsB.length) return false;
  return segsA.every((v, i) => v === segsB[i]);
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

/** Remove prefixo __MACOSX de paths do Finder. */
export function stripMacOsxPathPrefix(segments: string[]): string[] {
  if (segments[0]?.toLowerCase() === "__macosx") return segments.slice(1);
  return segments;
}

/** Divide path relativo em segmentos (ignora vazio e `.`). */
export function splitRelativePath(path: string): string[] {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s && s !== ".");
}
