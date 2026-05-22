/**
 * Parser mínimo de Set-Cookie (CAKEPHP=...) para encadear login + GET autenticados.
 */
export function mergeCookieHeader(
  existing: string,
  setCookieHeaders: string[],
): string {
  const map = new Map<string, string>();
  for (const part of existing.split(";").map((s) => s.trim()).filter(Boolean)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  for (const line of setCookieHeaders) {
    const first = line.split("\n")[0]?.trim() ?? "";
    const eq = first.indexOf("=");
    if (eq === -1) continue;
    const name = first.slice(0, eq).trim();
    const rest = first.slice(eq + 1);
    const semi = rest.indexOf(";");
    const value = semi === -1 ? rest.trim() : rest.slice(0, semi).trim();
    if (name) map.set(name, value);
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

export function getSetCookieList(res: Response): string[] {
  const any = res.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof any.getSetCookie === "function") {
    return any.getSetCookie();
  }
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}
