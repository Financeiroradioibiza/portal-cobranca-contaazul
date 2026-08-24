import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { PORTAL_PATHNAME_HEADER } from "@/lib/auth/portalPageGuard";
import { nextWithPortalSession } from "@/lib/auth/portalAccess";
import {
  isRouteAccessAllowed,
  resolveRouteAccessRule,
} from "@/lib/auth/routeAccess";
import { userHasRole } from "@/lib/auth/roles";
import { verifyPortalSessionToken } from "@/lib/auth/sessionToken";
import { isFluxoRafaelAdmin } from "@/lib/financeiro/fluxoRafaelAccess";
import { portalAccessDenied } from "@/lib/auth/portalAccess";

/** Repassa ao Node quando a Edge tem cookie mas não valida o JWT (Netlify). */
export function passPortalCookieToNode(request: NextRequest, pathname: string): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PORTAL_PATHNAME_HEADER, pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export async function finishVerifiedPortalSession(
  request: NextRequest,
  pathname: string,
  raw: string | undefined,
): Promise<NextResponse> {
  const session = await verifyPortalSessionToken(raw);
  if (!session) {
    // Netlify Edge muitas vezes não tem PORTAL_SESSION_SECRET — Node valida no handler.
    // Cookie inválido → requirePortalSession() nas APIs retorna 401.
    return passPortalCookieToNode(request, pathname);
  }

  if (
    pathname.startsWith("/config") ||
    pathname.startsWith("/api/config")
  ) {
    if (!userHasRole(session.roles, "master")) {
      return portalAccessDenied(request);
    }
  }

  if (
    pathname.startsWith("/financeiro/fluxo-rafael") ||
    pathname.startsWith("/api/financeiro/fluxo-rafael") ||
    pathname.startsWith("/fluxo-rafael/")
  ) {
    if (!isFluxoRafaelAdmin(session)) {
      return portalAccessDenied(request);
    }
  }

  const accessRule = resolveRouteAccessRule(pathname, request.method);
  if (accessRule && !isRouteAccessAllowed(accessRule, session.roles)) {
    return portalAccessDenied(request);
  }

  return nextWithPortalSession(request, session, pathname);
}
