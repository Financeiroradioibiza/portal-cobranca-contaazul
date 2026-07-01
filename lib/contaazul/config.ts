export const CONTA_AZUL_API_BASE = "https://api-v2.contaazul.com";
export const CONTA_AZUL_AUTH_LOGIN = "https://auth.contaazul.com/login";
export const CONTA_AZUL_TOKEN_URL = "https://auth.contaazul.com/oauth2/token";
export const CONTA_AZUL_SCOPE =
  "openid profile aws.cognito.signin.user.admin";

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return v.trim();
}

export function getContaAzulOAuthConfig() {
  return {
    clientId: requireEnv("CONTA_AZUL_CLIENT_ID"),
    clientSecret: requireEnv("CONTA_AZUL_CLIENT_SECRET"),
    redirectUri: requireEnv("CONTA_AZUL_REDIRECT_URI"),
  };
}

export function siteUrlFromRequest(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}
