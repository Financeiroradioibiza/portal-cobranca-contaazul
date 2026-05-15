import { SignJWT, jwtVerify } from "jose";
import {
  PORTAL_SESSION_COOKIE,
  PORTAL_SESSION_MAX_AGE,
} from "@/lib/auth/constants";

function getSecretKey() {
  const s = process.env.PORTAL_SESSION_SECRET?.trim();
  if (!s || s.length < 32) {
    throw new Error("PORTAL_SESSION_SECRET ausente ou curta (mín. 32 caracteres).");
  }
  return new TextEncoder().encode(s);
}

export async function signPortalSession(username: string): Promise<string> {
  const key = getSecretKey();
  const exp = new Date(Date.now() + PORTAL_SESSION_MAX_AGE * 1000);
  return new SignJWT({ sub: username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);
}

export async function verifyPortalSessionToken(
  token: string | undefined,
): Promise<string | null> {
  if (!token?.trim()) return null;
  try {
    const key = getSecretKey();
    const { payload } = await jwtVerify(token, key);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
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

export { PORTAL_SESSION_COOKIE, PORTAL_SESSION_MAX_AGE };
