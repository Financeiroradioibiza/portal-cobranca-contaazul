"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  PORTAL_TOP_NAV,
  filterTopNav,
  resolvePortalModule,
  topNavHref,
  type PortalTopNavItem,
} from "@/lib/portal/portalNav";
import type { PortalPermissionsMap } from "@/lib/portal/menuPermissions";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useChamadosResumo } from "@/components/chamados/useChamadosResumo";
import { IbiZapNavBadges } from "@/components/portal/IbiZapNavBadges";
import { usePortalPreviewProfile } from "@/components/portal/PortalPreviewProfileContext";
import type { ChamadosResumoView } from "@/lib/chamados/chamadoTypes";

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "RI";
}

type MeResponse = {
  email?: string;
  displayName?: string;
  isMaster?: boolean;
  menuPermissions?: PortalPermissionsMap | "all";
};

export function PortalTopbar() {
  const pathname = usePathname();
  const moduleId = resolvePortalModule(pathname);
  const preview = usePortalPreviewProfile();
  const [session, setSession] = useState<{
    displayName: string;
    isMaster: boolean;
    menuPermissions: PortalPermissionsMap | "all";
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MeResponse | null) => {
        if (!cancelled && data?.email) {
          setSession({
            displayName: data.displayName ?? data.email,
            isMaster: Boolean(data.isMaster),
            menuPermissions: data.menuPermissions ?? {},
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const perm = preview?.effectiveMenuPermissions ?? session?.menuPermissions ?? {};
  const visibleNav = filterTopNav(PORTAL_TOP_NAV, perm, {
    isMaster: preview?.effectiveIsMasterForNav ?? session?.isMaster,
  });
  const ibizapNavVisible = visibleNav.some((item) => item.id === "chamados");
  const { resumo: chamadosResumo } = useChamadosResumo(Boolean(session) && ibizapNavVisible);

  const accountHref = (() => {
    if (perm === "all") return "/config/usuarios";
    const cfg = perm.config;
    if (cfg === "all") return "/config/usuarios";
    if (Array.isArray(cfg) && cfg.includes("usuarios")) return "/config/usuarios";
    if (Array.isArray(cfg) && cfg.includes("logs")) return "/config/logs";
    return "/";
  })();

  return (
    <header className="portal-topbar">
      <Link href="/" className="portal-logo" aria-label="Radio Ibiza Portal">
        <span className="portal-logo-star" aria-hidden />
        <span>
          <span className="portal-logo-name">RADIO IBIZA</span>
          <span className="portal-logo-sub">Portal v5</span>
        </span>
      </Link>

      <nav className="portal-topnav" aria-label="Módulos">
        {visibleNav.map((item) => (
          <TopNavLink
            key={item.id}
            item={item}
            active={moduleId === item.id}
            perm={perm}
            chamadosResumo={item.id === "chamados" ? chamadosResumo : undefined}
          />
        ))}
      </nav>

      <div className="portal-topbar-right">
        <ThemeToggle />
        {session ?
          <Link
            href={accountHref}
            className="portal-user-avatar"
            title={session.displayName}
            aria-label="Conta"
          >
            {userInitials(session.displayName)}
          </Link>
        : null}
      </div>
    </header>
  );
}

function TopNavLink({
  item,
  active,
  perm,
  chamadosResumo,
}: {
  item: PortalTopNavItem;
  active: boolean;
  perm: PortalPermissionsMap | "all";
  chamadosResumo?: ChamadosResumoView;
}) {
  return (
    <Link
      href={topNavHref(item, perm)}
      className={"portal-topnav-item" + (active ? " portal-topnav-item--active" : "")}
    >
      <span aria-hidden>{item.icon}</span>
      {item.label}
      {chamadosResumo ? <IbiZapNavBadges resumo={chamadosResumo} mode="dots" /> : null}
    </Link>
  );
}
