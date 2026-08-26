"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PortalErrorReporter } from "@/components/portal/PortalErrorReporter";
import { PortalPreviewProfileBar } from "@/components/portal/PortalPreviewProfileBar";
import { PortalPreviewProfileProvider } from "@/components/portal/PortalPreviewProfileContext";
import { PortalPreviewRouteGuard } from "@/components/portal/PortalPreviewRouteGuard";
import { PortalSidebar } from "@/components/portal/PortalSidebar";
import { PortalTopbar } from "@/components/portal/PortalTopbar";
import type { PortalPermissionsMap } from "@/lib/portal/menuPermissions";

type MeResponse = {
  email?: string;
  displayName?: string;
  isMaster?: boolean;
  fluxoRafaelAdmin?: boolean;
  menuPermissions?: PortalPermissionsMap | "all";
};

export function PortalSessionRoot({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{
    isMaster: boolean;
    fluxoRafaelAdmin: boolean;
    menuPermissions: PortalPermissionsMap | "all";
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MeResponse | null) => {
        if (cancelled || !data?.email) return;
        setSession({
          isMaster: Boolean(data.isMaster),
          fluxoRafaelAdmin: Boolean(data.fluxoRafaelAdmin),
          menuPermissions: data.menuPermissions ?? {},
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const isMaster = session?.isMaster ?? false;
  const menuPermissions = session?.menuPermissions ?? {};
  const fluxoRafaelAdmin = session?.fluxoRafaelAdmin ?? false;

  return (
    <PortalPreviewProfileProvider
      isMaster={isMaster}
      realMenuPermissions={menuPermissions}
      fluxoRafaelAdmin={fluxoRafaelAdmin}
    >
      <div className="portal-shell">
        <PortalErrorReporter />
        <PortalTopbar />
        <PortalPreviewProfileBar />
        <PortalPreviewRouteGuard />
        <div className="portal-body">
          <PortalSidebar />
          <div className="portal-main">{children}</div>
        </div>
      </div>
    </PortalPreviewProfileProvider>
  );
}
