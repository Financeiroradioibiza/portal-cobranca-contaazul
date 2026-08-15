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
import { stripMobilePortalPrefix } from "@/lib/portal/mobilePaths";
import { resolvePortalPathname } from "@/lib/auth/portalPageGuard";

/** Guarda páginas /m/* — mesmas regras do portal desktop, paths normalizados. */
export async function guardMobilePortalPage(mobilePathname: string): Promise<void> {
  const pathname = stripMobilePortalPrefix(mobilePathname);
  const session = await getPortalSession();
  if (!session) {
    const next = safeInternalPath(mobilePathname);
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  if (
    (pathname.startsWith("/config") || pathname.startsWith("/api/config")) &&
    !userHasRole(session.roles, "master")
  ) {
    redirect("/m?error=forbidden");
  }

  if (
    pathname.startsWith("/financeiro/fluxo-rafael") ||
    pathname.startsWith("/fluxo-rafael/")
  ) {
    if (!isFluxoRafaelAdmin(session)) {
      redirect("/m?error=forbidden");
    }
  }

  const rule = resolveRouteAccessRule(pathname);
  if (rule && !isRouteAccessAllowed(rule, session.roles)) {
    redirect("/m?error=forbidden");
  }

  const menuPerm = await getPortalMenuPermissionsForEmail(session.email);
  if (!isPathAllowedByMenuPermissions(pathname, menuPerm)) {
    redirect("/m?error=forbidden");
  }
}

export async function resolveMobilePortalPathname(): Promise<string> {
  return resolvePortalPathname();
}
