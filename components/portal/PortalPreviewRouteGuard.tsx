"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePortalPreviewProfile } from "@/components/portal/PortalPreviewProfileContext";
import { isPathAllowedByMenuPermissions } from "@/lib/portal/pathMenuMap";
import { PORTAL_HOME_HREF } from "@/lib/portal/portalHome";
import {
  PORTAL_TOP_NAV,
  filterTopNav,
  topNavHref,
} from "@/lib/portal/portalNav";

/** Redireciona master em preview se a URL não existiria para aquele perfil. */
export function PortalPreviewRouteGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const ctx = usePortalPreviewProfile();

  useEffect(() => {
    if (!ctx?.isPreviewActive || !ctx.previewProfile) return;
    const perm = ctx.effectiveMenuPermissions;
    if (isPathAllowedByMenuPermissions(pathname, perm)) return;

    const visible = filterTopNav(PORTAL_TOP_NAV, perm, {
      isMaster: ctx.effectiveIsMasterForNav,
    });
    const fallback = visible[0] ? topNavHref(visible[0], perm) : PORTAL_HOME_HREF;
    if (fallback !== pathname) {
      router.replace(fallback);
    }
  }, [
    ctx?.isPreviewActive,
    ctx?.previewProfile,
    ctx?.effectiveMenuPermissions,
    ctx?.effectiveIsMasterForNav,
    pathname,
    router,
  ]);

  return null;
}
