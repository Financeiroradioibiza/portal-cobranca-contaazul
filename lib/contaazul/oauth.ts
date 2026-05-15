import {
  CONTA_AZUL_AUTH_LOGIN,
  CONTA_AZUL_SCOPE,
  CONTA_AZUL_TOKEN_URL,
  getContaAzulOAuthConfig,
} from "./config";

function basicAuthHeader(clientId: string, clientSecret: string) {
  const raw = `${clientId}:${clientSecret}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

export function buildAuthorizeUrl(state: string) {
  const { clientId, redirectUri } = getContaAzulOAuthConfig();
  const u = new URL(CONTA_AZUL_AUTH_LOGIN);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  // Espaços → "+" na query (x-www-form-urlencoded). Não passar "+" manual:
  // vira %2B e a Conta Azul responde invalid_scope.
  u.searchParams.set("scope", CONTA_AZUL_SCOPE);
  return u.toString();
}

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = getContaAzulOAuthConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch(CONTA_AZUL_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Token exchange falhou (${res.status}): ${text}`);
  }
  return JSON.parse(text) as TokenResponse;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<TokenResponse> {
  const { clientId, clientSecret } = getContaAzulOAuthConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(CONTA_AZUL_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Refresh token falhou (${res.status}): ${text}`);
  }
  return JSON.parse(text) as TokenResponse;
}
