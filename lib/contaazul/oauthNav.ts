import { safeInternalPath } from "@/lib/auth/safeRedirect";

const DEFAULT_OAUTH_RETURN = "/financeiro/vencidos";

/** Caminho interno seguro para redirecionar após OAuth (query opcional). */
export function safeContaAzulReturnPath(raw: string | null | undefined): string {
  if (raw == null || raw.trim() === "") return DEFAULT_OAUTH_RETURN;
  const s = raw.trim();
  const pathOnly = s.split("?")[0] ?? s;
  const safePath = safeInternalPath(pathOnly);
  if (safePath === "/") return DEFAULT_OAUTH_RETURN;
  const qIdx = s.indexOf("?");
  if (qIdx === -1) return safePath;
  return `${safePath}${s.slice(qIdx)}`;
}

/** URL do início do OAuth; `returnPath` volta após autorizar (mesma aba). */
export function contaAzulLoginHref(returnPath?: string | null): string {
  const base = "/api/contaazul/login";
  if (!returnPath?.trim()) return base;
  const safe = safeContaAzulReturnPath(returnPath);
  return `${base}?return=${encodeURIComponent(safe)}`;
}

export function appendOAuthQuery(path: string, key: "connected" | "oauth_error", value: string): string {
  const safe = safeContaAzulReturnPath(path);
  const u = new URL(safe, "http://local");
  u.searchParams.set(key, value);
  return `${u.pathname}${u.search}`;
}
