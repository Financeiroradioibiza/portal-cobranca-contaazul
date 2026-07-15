import { NextResponse, after } from "next/server";
import type { NextRequest } from "next/server";
import { PORTAL_SESSION_COOKIE } from "@/lib/auth/constants";
import { shouldRecordPortalAudit } from "@/lib/audit/describeAuditAction";
import { portalAccessDenied } from "@/lib/auth/portalAccess";
import {
  isRouteAccessAllowed,
  resolveRouteAccessRule,
} from "@/lib/auth/routeAccess";
import { verifyPortalSessionToken } from "@/lib/auth/sessionToken";
import { safeInternalPath } from "@/lib/auth/safeRedirect";
import { isPortalAuthConfigured, isPortalAuthDisabled } from "@/lib/auth/users";
import { authorizeOcAutoDispatchCron } from "@/lib/manualReminders/ocAutoDispatchAuth";
import { userHasRole } from "@/lib/auth/roles";
import { isFluxoRafaelAdmin } from "@/lib/financeiro/fluxoRafaelAccess";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /** Cron SMTP «pedido OC»: não exige sessão do portal — só Bearer com OC_EMAIL_CRON_SECRET / CRON_SECRET. */
  if (pathname === "/api/manual-envios/oc-email/auto-dispatch") {
    const auth = authorizeOcAutoDispatchCron(request);
    if (!auth.ok) return auth.response;
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  if (isPortalAuthDisabled()) {
    return NextResponse.next();
  }

  const configured = isPortalAuthConfigured();

  if (pathname === "/login" || pathname.startsWith("/login/")) {
    if (configured) {
      const raw = request.cookies.get(PORTAL_SESSION_COOKIE)?.value;
      const session = await verifyPortalSessionToken(raw);
      if (session) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
    return NextResponse.next();
  }

  if (
    pathname === "/api/auth/login" ||
    pathname.startsWith("/api/auth/login/") ||
    pathname === "/api/auth/logout" ||
    pathname.startsWith("/api/auth/logout/")
  ) {
    return NextResponse.next();
  }

  if (
    pathname === "/api/contaazul/callback" ||
    pathname.startsWith("/api/contaazul/callback/")
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/player/ingest/")) {
    return NextResponse.next();
  }

  if (pathname === "/prototype.html" && process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  if (!configured) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
    }
    const u = request.nextUrl.clone();
    u.pathname = "/login";
    u.searchParams.set("error", "config");
    return NextResponse.redirect(u);
  }

  const raw = request.cookies.get(PORTAL_SESSION_COOKIE)?.value;
  const session = await verifyPortalSessionToken(raw);
  if (!session) {
    const isBrowserOAuthStart =
      pathname === "/api/contaazul/login" ||
      pathname.startsWith("/api/contaazul/login/");
    if (pathname.startsWith("/api/") && !isBrowserOAuthStart) {
      return NextResponse.json(
        { error: "unauthorized", connected: false },
        { status: 401 },
      );
    }
    const u = request.nextUrl.clone();
    u.pathname = "/login";
    const nextPath = safeInternalPath(pathname + request.nextUrl.search);
    u.searchParams.set("next", nextPath);
    return NextResponse.redirect(u);
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

  const accessRule = resolveRouteAccessRule(pathname);
  if (accessRule && !isRouteAccessAllowed(accessRule, session.roles)) {
    return portalAccessDenied(request);
  }

  if (shouldRecordPortalAudit(pathname, request.method)) {
    const auditBody = {
      path: pathname,
      method: request.method,
      query: request.nextUrl.search || undefined,
      ip:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "",
      userAgent: request.headers.get("user-agent") ?? "",
    };
    const cookie = request.headers.get("cookie") ?? "";
    const origin = request.nextUrl.origin;

    after(async () => {
      try {
        await fetch(`${origin}/api/internal/audit-log`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie,
          },
          body: JSON.stringify(auditBody),
        });
      } catch {
        /* auditoria não deve bloquear navegação */
      }
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/webpack-hmr|_next/data).*)"],
};
