import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/auth/portalAccess";
import {
  isRouteAccessAllowed,
  resolveRouteAccessRule,
} from "@/lib/auth/routeAccess";
import { userHasRole } from "@/lib/auth/roles";
import { safeInternalPath } from "@/lib/auth/safeRedirect";
import { isFluxoRafaelAdmin } from "@/lib/financeiro/fluxoRafaelAccess";

export const PORTAL_PATHNAME_HEADER = "x-portal-pathname";

export async function resolvePortalPathname(): Promise<string> {
  const h = await headers();
  const fromMiddleware = h.get(PORTAL_PATHNAME_HEADER)?.trim();
  if (fromMiddleware) return fromMiddleware;
  const url = h.get("x-url") ?? h.get("next-url");
  if (url) {
    try {
      return new URL(url).pathname;
    } catch {
      /* ignore */
    }
  }
  return "/";
}

/** Guarda páginas do portal no runtime Node (JWT validado aqui, não na Edge). */
export async function guardPortalPage(pathname: string): Promise<void> {
  const session = await getPortalSession();
  if (!session) {
    const next = safeInternalPath(pathname);
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  if (
    (pathname.startsWith("/config") || pathname.startsWith("/api/config")) &&
    !userHasRole(session.roles, "master")
  ) {
    redirect("/?error=forbidden");
  }

  if (
    pathname.startsWith("/financeiro/fluxo-rafael") ||
    pathname.startsWith("/fluxo-rafael/")
  ) {
    if (!isFluxoRafaelAdmin(session)) {
      redirect("/?error=forbidden");
    }
  }

  const rule = resolveRouteAccessRule(pathname);
  if (rule && !isRouteAccessAllowed(rule, session.roles)) {
    redirect("/?error=forbidden");
  }
}

export async function redirectIfPortalSession(nextRaw?: string | null): Promise<void> {
  const session = await getPortalSession();
  if (!session) return;
  redirect(safeInternalPath(nextRaw));
}
