import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PORTAL_SESSION_COOKIE } from "@/lib/auth/constants";
import { getPortalSession } from "@/lib/auth/portalAccess";
import { recordPortalAuditLog } from "@/lib/audit/portalAuditLog";
import { portalSessionCookieOptions } from "@/lib/auth/sessionToken";

export async function POST(request: Request) {
  const session = await getPortalSession();

  if (session) {
    try {
      await recordPortalAuditLog({
        userEmail: session.email,
        userDisplayName: session.displayName,
        method: "POST",
        path: "/api/auth/logout",
        actionOverride: "Saiu do portal",
        ip:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request.headers.get("x-real-ip") ??
          "",
        userAgent: request.headers.get("user-agent") ?? "",
      });
    } catch (e) {
      console.error("[auth/logout audit]", e);
    }
  }

  const jar = await cookies();
  jar.set(PORTAL_SESSION_COOKIE, "", { ...portalSessionCookieOptions(), maxAge: 0 });
  return NextResponse.json({ ok: true });
}
