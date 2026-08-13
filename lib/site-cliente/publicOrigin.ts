/** Origem pública do site cliente (ex.: https://cliente.radioibiza.app.br). */
export function siteClientePublicOrigin(): string | null {
  const fromEnv = process.env.SITE_CLIENTE_PUBLIC_ORIGIN?.trim();
  if (!fromEnv) return null;
  return fromEnv.replace(/\/$/, "");
}

/** URL de login para enviar ao cliente (Fase 1: login.html no site separado). */
export function siteClientePublicLoginUrl(fallbackPortalOrigin?: string): string {
  const origin = siteClientePublicOrigin();
  if (origin) return `${origin}/login.html`;

  const fallback = fallbackPortalOrigin?.trim().replace(/\/$/, "");
  if (fallback) return `${fallback}/site-cliente/login`;

  return "/site-cliente/login";
}
