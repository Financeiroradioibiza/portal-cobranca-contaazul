import type { NextRequest } from "next/server";
import { PORTAL_SESSION_COOKIE } from "@/lib/auth/constants";

/** Header alternativo quando o proxy Netlify não repassa Authorization. */
export const PORTAL_SESSION_BEARER_HEADER = "x-portal-session";

export function portalSessionTokenFromNextRequest(request: NextRequest): string | undefined {
  const fromCookie = request.cookies.get(PORTAL_SESSION_COOKIE)?.value?.trim();
  if (fromCookie) return fromCookie;

  const auth = request.headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }

  const fromHeader = request.headers.get(PORTAL_SESSION_BEARER_HEADER)?.trim();
  if (fromHeader) return fromHeader;

  return undefined;
}

export function portalSessionTokenFromHeaders(headers: Headers, cookieHeader?: string | null): string | undefined {
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      if (part.slice(0, eq).trim() !== PORTAL_SESSION_COOKIE) continue;
      const value = part.slice(eq + 1).trim();
      try {
        const decoded = decodeURIComponent(value);
        if (decoded) return decoded;
      } catch {
        if (value) return value;
      }
    }
  }

  const auth = headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }

  const fromHeader = headers.get(PORTAL_SESSION_BEARER_HEADER)?.trim();
  if (fromHeader) return fromHeader;

  return undefined;
}
