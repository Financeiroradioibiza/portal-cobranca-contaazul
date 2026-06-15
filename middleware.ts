import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PORTAL_SESSION_COOKIE } from "@/lib/auth/constants";
import { verifyPortalSessionToken } from "@/lib/auth/sessionToken";
import { safeInternalPath } from "@/lib/auth/safeRedirect";
import { isPortalAuthConfigured, isPortalAuthDisabled } from "@/lib/auth/users";
import { authorizeOcAutoDispatchCron } from "@/lib/manualReminders/ocAutoDispatchAuth";
import { userHasRole } from "@/lib/auth/roles";
import { configAccessDenied } from "@/lib/auth/portalAccess";

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

  /** Prototipo público `/prototype.html` e proxy opcional `/api/radio-painel` (credenciais Painel ficam só no servidor). */
  if (pathname.startsWith("/api/radio-painel") || pathname === "/prototype.html") {
    return NextResponse.next();
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
    // APIs devem responder JSON; exceção: GET em /api/contaazul/login (link "Conectar") precisa redirect HTML.
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
      return configAccessDenied(request);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/webpack-hmr|_next/data).*)"],
};
