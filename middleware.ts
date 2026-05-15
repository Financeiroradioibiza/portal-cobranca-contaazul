import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PORTAL_SESSION_COOKIE } from "@/lib/auth/constants";
import { verifyPortalSessionToken } from "@/lib/auth/sessionToken";
import { isPortalAuthConfigured, isPortalAuthDisabled } from "@/lib/auth/users";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
      const sub = await verifyPortalSessionToken(raw);
      if (sub) {
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

  if (!configured) {
    const u = request.nextUrl.clone();
    u.pathname = "/login";
    u.searchParams.set("error", "config");
    return NextResponse.redirect(u);
  }

  const raw = request.cookies.get(PORTAL_SESSION_COOKIE)?.value;
  const sub = await verifyPortalSessionToken(raw);
  if (!sub) {
    const u = request.nextUrl.clone();
    u.pathname = "/login";
    u.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(u);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/webpack-hmr|_next/data).*)"],
};
