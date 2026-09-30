import "server-only";

function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://portal.radioibiza.app.br";
  return raw.replace(/\/$/, "");
}

/** Deep link PWA (mobile staff). */
export function chamadosMobilePushUrl(query?: { conversa?: string }): string {
  const base = `${siteOrigin()}/m/chamados`;
  if (query?.conversa?.trim()) {
    return `${base}?conversa=${encodeURIComponent(query.conversa.trim())}`;
  }
  return base;
}
