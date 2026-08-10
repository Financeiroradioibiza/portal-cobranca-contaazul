import { SignJWT, jwtVerify } from "jose";
import type { SiteClientePermissoes } from "@/lib/site-cliente/permissions";
import { parseSiteClientePermissoes } from "@/lib/site-cliente/permissions";

export const SITE_CLIENTE_SESSION_COOKIE = "site_cliente_session";
export const SITE_CLIENTE_SESSION_MAX_AGE = 60 * 60 * 12;

export type SiteClienteSessionPayload = {
  userId: string;
  grupoId: string;
  grupoNome: string;
  nome: string;
  loginEmail: string;
  permissoes: SiteClientePermissoes;
};

function getSecretKey() {
  const s = process.env.PORTAL_SESSION_SECRET?.trim();
  if (!s || s.length < 32) {
    throw new Error("PORTAL_SESSION_SECRET ausente ou curta (mín. 32 caracteres).");
  }
  return new TextEncoder().encode(s);
}

export async function signSiteClienteSession(
  payload: SiteClienteSessionPayload,
): Promise<string> {
  const key = getSecretKey();
  const exp = new Date(Date.now() + SITE_CLIENTE_SESSION_MAX_AGE * 1000);
  return new SignJWT({
    typ: "site_cliente",
    uid: payload.userId,
    gid: payload.grupoId,
    gname: payload.grupoNome,
    name: payload.nome,
    email: payload.loginEmail,
    perm: payload.permissoes,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);
}

export async function verifySiteClienteSessionToken(
  token: string | undefined,
): Promise<SiteClienteSessionPayload | null> {
  if (!token?.trim()) return null;
  try {
    const key = getSecretKey();
    const { payload } = await jwtVerify(token, key);
    if (payload.typ !== "site_cliente") return null;
    const userId = typeof payload.uid === "string" ? payload.uid : "";
    const grupoId = typeof payload.gid === "string" ? payload.gid : "";
    if (!userId || !grupoId) return null;
    return {
      userId,
      grupoId,
      grupoNome: typeof payload.gname === "string" ? payload.gname : "",
      nome: typeof payload.name === "string" ? payload.name : "",
      loginEmail: typeof payload.email === "string" ? payload.email : "",
      permissoes: parseSiteClientePermissoes(payload.perm),
    };
  } catch {
    return null;
  }
}

export function siteClienteSessionCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SITE_CLIENTE_SESSION_MAX_AGE,
  };
}
