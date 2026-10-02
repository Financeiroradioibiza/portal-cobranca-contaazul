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

function pushTokenCandidate(list: string[], token: string | undefined | null): void {
  const s = token?.trim();
  if (!s || list.includes(s)) return;
  list.push(s);
}

/** Bearer / X-Portal-Session antes de cookie (Safari iOS manda cookie JWT velho + header novo). */
export function collectPortalSessionTokenCandidates(
  headers: Headers,
  cookieHeader?: string | null,
): string[] {
  const candidates: string[] = [];

  const auth = headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    pushTokenCandidate(candidates, auth.slice(7));
  }
  pushTokenCandidate(candidates, headers.get(PORTAL_SESSION_BEARER_HEADER));

  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      if (part.slice(0, eq).trim() !== PORTAL_SESSION_COOKIE) continue;
      const value = part.slice(eq + 1).trim();
      try {
        pushTokenCandidate(candidates, decodeURIComponent(value));
      } catch {
        pushTokenCandidate(candidates, value);
      }
    }
  }

  return candidates;
}

export function portalSessionTokenFromHeaders(headers: Headers, cookieHeader?: string | null): string | undefined {
  return collectPortalSessionTokenCandidates(headers, cookieHeader)[0];
}
