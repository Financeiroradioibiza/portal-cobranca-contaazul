import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PORTAL_SESSION_COOKIE } from "@/lib/auth/constants";
import type { PortalRole } from "@/lib/auth/roles";
import { userHasRole } from "@/lib/auth/roles";
import {
  verifyPortalSessionToken,
  type PortalSessionPayload,
} from "@/lib/auth/sessionToken";

export async function getPortalSession(): Promise<PortalSessionPayload | null> {
  const jar = await cookies();
  const raw = jar.get(PORTAL_SESSION_COOKIE)?.value;
  return verifyPortalSessionToken(raw);
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

export function isMasterRole(roles: PortalRole[]): boolean {
  return roles.includes("master");
}

/** Middleware helper — redirect HTML or JSON 403. */
export function configAccessDenied(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const u = request.nextUrl.clone();
  u.pathname = "/";
  u.searchParams.set("error", "forbidden");
  return NextResponse.redirect(u);
}
