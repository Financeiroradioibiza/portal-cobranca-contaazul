/**
 * Evita open redirect: só caminhos relativos do próprio site (path interno).
 */
export function safeInternalPath(raw: string | null | undefined): string {
  if (raw == null) return "/";
  const s = raw.trim();
  if (s === "") return "/";
  if (!s.startsWith("/") || s.startsWith("//")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(s)) return "/";
  if (/^(javascript|data|vbscript):/i.test(s)) return "/";
  return s.length > 2048 ? "/" : s;
}
