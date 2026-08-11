import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const SITE_CLIENTE_DESKTOP_COOKIE = "site_cliente_desktop";
export const SITE_CLIENTE_BASE = "/site-cliente";
export const SITE_CLIENTE_MOBILE_BASE = "/m/site-cliente";

export function isMobileUserAgent(ua: string): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
}

export function isSiteClientePath(pathname: string): boolean {
  return (
    pathname === SITE_CLIENTE_BASE ||
    pathname.startsWith(`${SITE_CLIENTE_BASE}/`) ||
    pathname === SITE_CLIENTE_MOBILE_BASE ||
    pathname.startsWith(`${SITE_CLIENTE_MOBILE_BASE}/`)
  );
}

export function toMobileSiteClientePath(pathname: string): string | null {
  if (!pathname.startsWith(SITE_CLIENTE_BASE) || pathname.startsWith(SITE_CLIENTE_MOBILE_BASE)) {
    return null;
  }
  return pathname.replace(SITE_CLIENTE_BASE, SITE_CLIENTE_MOBILE_BASE);
}

export function toDesktopSiteClientePath(pathname: string): string | null {
  if (!pathname.startsWith(SITE_CLIENTE_MOBILE_BASE)) return null;
  return pathname.replace(SITE_CLIENTE_MOBILE_BASE, SITE_CLIENTE_BASE);
}

/** Redireciona celular/tablet para /m/ ou respeita ?desktop=1 / ?mobile=1. */
export function resolveSiteClienteVariantRedirect(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (!isSiteClientePath(pathname)) return null;

  const ua = request.headers.get("user-agent") ?? "";
  const wantsDesktop = request.nextUrl.searchParams.get("desktop") === "1";
  const wantsMobile = request.nextUrl.searchParams.get("mobile") === "1";

  if (wantsDesktop || wantsMobile) {
    const u = request.nextUrl.clone();
    u.searchParams.delete("desktop");
    u.searchParams.delete("mobile");

    if (wantsDesktop) {
      u.pathname = toDesktopSiteClientePath(pathname) ?? pathname;
      const res = NextResponse.redirect(u);
      res.cookies.set(SITE_CLIENTE_DESKTOP_COOKIE, "1", {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
      return res;
    }

    u.pathname = toMobileSiteClientePath(pathname) ?? pathname;
    const res = NextResponse.redirect(u);
    res.cookies.set(SITE_CLIENTE_DESKTOP_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  const preferDesktop = Boolean(request.cookies.get(SITE_CLIENTE_DESKTOP_COOKIE)?.value);
  const mobile = isMobileUserAgent(ua) && !preferDesktop;

  if (mobile && pathname.startsWith(SITE_CLIENTE_BASE) && !pathname.startsWith(SITE_CLIENTE_MOBILE_BASE)) {
    const mobilePath = toMobileSiteClientePath(pathname);
    if (mobilePath) {
      const u = request.nextUrl.clone();
      u.pathname = mobilePath;
      return NextResponse.redirect(u);
    }
  }

  if (!mobile && pathname.startsWith(SITE_CLIENTE_MOBILE_BASE)) {
    const desktopPath = toDesktopSiteClientePath(pathname);
    if (desktopPath) {
      const u = request.nextUrl.clone();
      u.pathname = desktopPath;
      return NextResponse.redirect(u);
    }
  }

  return null;
}
