import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isMobileUserAgent } from "@/lib/site-cliente/mobileDetect";
import {
  isDesktopPortalPath,
  isPortalMobileStaffPath,
  toDesktopPortalPath,
  toMobilePortalPath,
  PORTAL_MOBILE_BASE,
} from "@/lib/portal/mobilePaths";

export const PORTAL_DESKTOP_COOKIE = "portal_desktop";

export function resolvePortalMobileRedirect(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;

  const wantsDesktop = request.nextUrl.searchParams.get("desktop") === "1";
  const wantsMobile = request.nextUrl.searchParams.get("mobile") === "1";

  if (wantsDesktop || wantsMobile) {
    const u = request.nextUrl.clone();
    u.searchParams.delete("desktop");
    u.searchParams.delete("mobile");

    if (wantsDesktop) {
      if (isPortalMobileStaffPath(pathname)) {
        u.pathname = toDesktopPortalPath(pathname);
      }
      const res = NextResponse.redirect(u);
      res.cookies.set(PORTAL_DESKTOP_COOKIE, "1", {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
      return res;
    }

    if (pathname === "/login" || pathname.startsWith("/login/")) {
      u.pathname = `${PORTAL_MOBILE_BASE}/login`;
    } else if (isDesktopPortalPath(pathname)) {
      u.pathname = toMobilePortalPath(pathname);
    }
    const res = NextResponse.redirect(u);
    res.cookies.set(PORTAL_DESKTOP_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  const preferDesktop = Boolean(request.cookies.get(PORTAL_DESKTOP_COOKIE)?.value);
  const ua = request.headers.get("user-agent") ?? "";
  const mobile = isMobileUserAgent(ua) && !preferDesktop;

  if (mobile) {
    if (pathname === "/login" || pathname.startsWith("/login/")) {
      const u = request.nextUrl.clone();
      u.pathname = `${PORTAL_MOBILE_BASE}/login`;
      return NextResponse.redirect(u);
    }
    if (isDesktopPortalPath(pathname) && !pathname.startsWith(PORTAL_MOBILE_BASE)) {
      const u = request.nextUrl.clone();
      u.pathname = toMobilePortalPath(pathname);
      return NextResponse.redirect(u);
    }
  }

  if (!mobile && isPortalMobileStaffPath(pathname) && pathname !== `${PORTAL_MOBILE_BASE}/login`) {
    const u = request.nextUrl.clone();
    u.pathname = toDesktopPortalPath(pathname);
    return NextResponse.redirect(u);
  }

  return null;
}
