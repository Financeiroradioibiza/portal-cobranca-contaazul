/** Caminho fixo do callback OAuth neste portal. */
export const CONTA_AZUL_CALLBACK_PATH = "/api/contaazul/callback";

/** URL histórica ainda válida no mesmo deploy Netlify. */
export const CONTA_AZUL_LEGACY_CALLBACK =
  "https://site-vencidos-ibiza.netlify.app/api/contaazul/callback";

export function normalizeOAuthRedirectUri(raw: string): string {
  const u = new URL(raw.trim());
  u.pathname = CONTA_AZUL_CALLBACK_PATH;
  u.search = "";
  u.hash = "";
  return u.toString();
}

/**
 * Monta o redirect_uri que a Conta Azul exige **idêntico** ao cadastro do app.
 * Usa o host da requisição (ex.: portal.radioibiza.app.br) para o cookie OAuth
 * bater com o callback na mesma origem.
 */
export function oauthRedirectUriFromRequest(request: Request): string {
  const configured = process.env.CONTA_AZUL_REDIRECT_URI?.trim();
  const req = new URL(request.url);
  const fromRequest = normalizeOAuthRedirectUri(`${req.protocol}//${req.host}${CONTA_AZUL_CALLBACK_PATH}`);

  if (!configured) return fromRequest;

  try {
    const cfg = normalizeOAuthRedirectUri(configured);
    const cfgHost = new URL(cfg).host;
    // Mesmo host do browser → string exata do env (preserva o que está na CA).
    if (cfgHost === req.host) return cfg;
  } catch {
    return fromRequest;
  }

  return fromRequest;
}
