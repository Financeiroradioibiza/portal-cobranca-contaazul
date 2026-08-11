import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/auth/portalAccess";
import {
  isRouteAccessAllowed,
  resolveRouteAccessRule,
} from "@/lib/auth/routeAccess";
import { userHasRole } from "@/lib/auth/roles";
import { safeInternalPath } from "@/lib/auth/safeRedirect";
import { getPortalMenuPermissionsForEmail } from "@/lib/config/portalUserPermissions";
import { isFluxoRafaelAdmin } from "@/lib/financeiro/fluxoRafaelAccess";
import { isPathAllowedByMenuPermissions } from "@/lib/portal/pathMenuMap";

export const PORTAL_PATHNAME_HEADER = "x-portal-pathname";

function readPathnameHeader(h: Headers): string | undefined {
  const direct = h.get(PORTAL_PATHNAME_HEADER)?.trim();
  if (direct) return direct;
  const prefixed = h.get(`x-middleware-request-${PORTAL_PATHNAME_HEADER}`)?.trim();
  if (prefixed) return prefixed;
  for (const [key, value] of h.entries()) {
    if (key.toLowerCase().endsWith("portal-pathname") && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export async function resolvePortalPathname(): Promise<string> {
  const h = await headers();
  const fromMiddleware = readPathnameHeader(h);
  if (fromMiddleware) return fromMiddleware;

  for (const key of ["next-url", "x-url", "x-invoke-path", "x-forwarded-uri"]) {
    const raw = h.get(key)?.trim();
    if (!raw) continue;
    try {
      const path = raw.startsWith("/") ? raw : new URL(raw).pathname;
      if (path.startsWith("/")) return path.split("?")[0] ?? path;
    } catch {
      /* ignore */
    }
  }

  return "/";
}

/** Guarda páginas do portal no runtime Node (JWT + perfil Config → Usuários). */
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

  const menuPerm = await getPortalMenuPermissionsForEmail(session.email);
  if (!isPathAllowedByMenuPermissions(pathname, menuPerm)) {
    redirect("/?error=forbidden");
  }
}

export async function redirectIfPortalSession(nextRaw?: string | null): Promise<void> {
  const session = await getPortalSession();
  if (!session) return;
  redirect(safeInternalPath(nextRaw));
}
