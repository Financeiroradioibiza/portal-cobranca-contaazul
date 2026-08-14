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

export function siteClienteSessionCookieOptions(opts?: {
  /** Host visível ao browser (ex.: cliente.radioibiza.app.br via proxy Netlify). */
  requestHost?: string | null;
}): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
  domain?: string;
} {
  const secure = process.env.NODE_ENV === "production";
  const base = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SITE_CLIENTE_SESSION_MAX_AGE,
  };

  const explicit = process.env.SITE_CLIENTE_COOKIE_DOMAIN?.trim();
  if (explicit) {
    const domain = explicit.startsWith(".") ? explicit.slice(1) : explicit;
    return { ...base, domain };
  }

  const publicOrigin = process.env.SITE_CLIENTE_PUBLIC_ORIGIN?.trim();
  if (publicOrigin) {
    try {
      const host = new URL(publicOrigin).hostname;
      if (host && host !== "localhost") {
        return { ...base, domain: host };
      }
    } catch {
      //
    }
  }

  const forwarded = opts?.requestHost?.trim().toLowerCase();
  if (forwarded && forwarded.includes("cliente.") && !forwarded.includes("portal.")) {
    return { ...base, domain: forwarded };
  }

  return base;
}

/** Host do cliente quando o login vem via proxy Netlify (X-Forwarded-Host). */
export function siteClienteCookieHostFromRequest(req: Request): string | null {
  const xf = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (xf) return xf;
  try {
    return new URL(req.url).hostname;
  } catch {
    return null;
  }
}

/** Lê cookie de sessão do jar ou do header bruto (proxy Netlify → portal). */
export function siteClienteSessionTokenFromCookieHeader(
  cookieHeader: string | null | undefined,
): string | undefined {
  if (!cookieHeader?.trim()) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)site_cliente_session=([^;]*)/);
  const raw = match?.[1]?.trim();
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
