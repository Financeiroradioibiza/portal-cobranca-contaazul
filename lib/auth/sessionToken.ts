import { SignJWT, jwtVerify } from "jose";
import type { PortalRole } from "@/lib/auth/roles";
import { parsePortalRoles } from "@/lib/auth/roles";
import {
  CHAMADOS_APP_SESSION_MAX_AGE,
  PORTAL_SESSION_COOKIE,
  PORTAL_SESSION_MAX_AGE,
} from "@/lib/auth/constants";
import { readPortalSessionSecret } from "@/lib/auth/sessionSecret";

export type PortalSessionPayload = {
  email: string;
  roles: PortalRole[];
  displayName?: string;
};

function getSecretKey() {
  const s = readPortalSessionSecret();
  if (!s || s.length < 32) {
    throw new Error("PORTAL_SESSION_SECRET ausente ou curta (mín. 32 caracteres).");
  }
  return new TextEncoder().encode(s);
}

export async function signPortalSession(
  user: PortalSessionPayload,
  opts?: { maxAgeSec?: number },
): Promise<string> {
  const key = getSecretKey();
  const maxAge = opts?.maxAgeSec ?? PORTAL_SESSION_MAX_AGE;
  const exp = new Date(Date.now() + maxAge * 1000);
  return new SignJWT({
    sub: user.email,
    roles: user.roles,
    name: user.displayName ?? user.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);
}

export async function verifyPortalSessionToken(
  token: string | undefined,
): Promise<PortalSessionPayload | null> {
  if (!token?.trim()) return null;
  try {
    const key = getSecretKey();
    const { payload } = await jwtVerify(token, key);
    const email = typeof payload.sub === "string" ? payload.sub : "";
    if (!email) return null;
    const rolesRaw = payload.roles;
    const roles = parsePortalRoles(rolesRaw);
    const displayName =
      typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : undefined;
    return { email, roles, displayName };
  } catch {
    return null;
  }
}

/** Compat: retorna e-mail da sessão ou null. */
export async function verifyPortalSessionEmail(
  token: string | undefined,
): Promise<string | null> {
  const s = await verifyPortalSessionToken(token);
  return s?.email ?? null;
}

export function portalSessionCookieOptions(): {
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
    maxAge: PORTAL_SESSION_MAX_AGE,
  };
}

export { CHAMADOS_APP_SESSION_MAX_AGE, PORTAL_SESSION_COOKIE, PORTAL_SESSION_MAX_AGE };
