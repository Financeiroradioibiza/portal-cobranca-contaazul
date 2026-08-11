import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  PORTAL_AUTH_EMAIL_HEADER,
  PORTAL_AUTH_NAME_HEADER,
  PORTAL_AUTH_ROLES_HEADER,
  PORTAL_SESSION_COOKIE,
} from "@/lib/auth/constants";
import type { PortalRole } from "@/lib/auth/roles";
import { parsePortalRoles, userHasRole } from "@/lib/auth/roles";
import {
  isRouteAccessAllowed,
  resolveRouteAccessRule,
} from "@/lib/auth/routeAccess";
import {
  verifyPortalSessionToken,
  type PortalSessionPayload,
} from "@/lib/auth/sessionToken";
import { isVinhetaConfigAdmin } from "@/lib/criacao/vinhetaConfigAccess";
import { isFluxoRafaelAdmin } from "@/lib/financeiro/fluxoRafaelAccess";

function readCookieValue(cookieHeader: string | null | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

export function sessionFromMiddlewareHeaders(h: Headers): PortalSessionPayload | null {
  const email = h.get(PORTAL_AUTH_EMAIL_HEADER)?.trim().toLowerCase();
  if (!email) return null;
  let roles: PortalRole[] = [];
  try {
    roles = parsePortalRoles(JSON.parse(h.get(PORTAL_AUTH_ROLES_HEADER) ?? "[]"));
  } catch {
    return null;
  }
  const displayName = h.get(PORTAL_AUTH_NAME_HEADER)?.trim() || undefined;
  return { email, roles, displayName };
}

/** Middleware: repassa sessão já validada para handlers (Netlify/Next serverless). */
export function nextWithPortalSession(request: NextRequest, session: PortalSessionPayload): NextResponse {
  const requestHeaders = new Headers(request.headers);
  for (const key of [PORTAL_AUTH_EMAIL_HEADER, PORTAL_AUTH_ROLES_HEADER, PORTAL_AUTH_NAME_HEADER]) {
    requestHeaders.delete(key);
  }
  requestHeaders.set(PORTAL_AUTH_EMAIL_HEADER, session.email);
  requestHeaders.set(PORTAL_AUTH_ROLES_HEADER, JSON.stringify(session.roles));
  if (session.displayName?.trim()) {
    requestHeaders.set(PORTAL_AUTH_NAME_HEADER, session.displayName.trim());
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export async function getPortalSession(): Promise<PortalSessionPayload | null> {
  const jar = await cookies();
  let raw = jar.get(PORTAL_SESSION_COOKIE)?.value;
  const h = await headers();
  if (!raw?.trim()) {
    raw = readCookieValue(h.get("cookie"), PORTAL_SESSION_COOKIE);
  }
  const fromCookie = await verifyPortalSessionToken(raw);
  if (fromCookie) return fromCookie;
  return sessionFromMiddlewareHeaders(h);
}

export function requirePortalSession(session: PortalSessionPayload | null): PortalSessionPayload {
  if (!session) {
    throw new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session;
}

export function requireMaster(session: PortalSessionPayload): void {
  if (!userHasRole(session.roles, "master")) {
    throw new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function requireMasterSession(): Promise<PortalSessionPayload> {
  const session = requirePortalSession(await getPortalSession());
  requireMaster(session);
  return session;
}

export function requireVinhetaConfigAdmin(session: PortalSessionPayload): void {
  if (!isVinhetaConfigAdmin(session)) {
    throw new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function requireVinhetaConfigSession(): Promise<PortalSessionPayload> {
  const session = requirePortalSession(await getPortalSession());
  requireVinhetaConfigAdmin(session);
  return session;
}

export function requireFluxoRafaelAdmin(session: PortalSessionPayload): void {
  if (!isFluxoRafaelAdmin(session)) {
    throw new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function requireFluxoRafaelSession(): Promise<PortalSessionPayload> {
  const session = requirePortalSession(await getPortalSession());
  requireFluxoRafaelAdmin(session);
  return session;
}

function requireRouteAccess(pathname: string, session: PortalSessionPayload): void {
  const rule = resolveRouteAccessRule(pathname);
  if (rule && !isRouteAccessAllowed(rule, session.roles)) {
    throw new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function requireConsultaPainelSession(): Promise<PortalSessionPayload> {
  const session = requirePortalSession(await getPortalSession());
  requireRouteAccess("/api/radio-painel/query", session);
  return session;
}

export function isMasterRole(roles: PortalRole[]): boolean {
  return roles.includes("master");
}

/** Middleware helper — redirect HTML or JSON 403. */
export function portalAccessDenied(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const u = request.nextUrl.clone();
  u.pathname = "/";
  u.searchParams.set("error", "forbidden");
  return NextResponse.redirect(u);
}

/** @deprecated Use portalAccessDenied */
export const configAccessDenied = portalAccessDenied;
