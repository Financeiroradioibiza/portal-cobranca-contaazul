"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  PORTAL_TOP_NAV,
  resolvePortalModule,
  topNavHref,
  type PortalTopNavItem,
} from "@/lib/portal/portalNav";
import { ThemeToggle } from "@/components/ThemeToggle";

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "RI";
}

export function PortalTopbar() {
  const pathname = usePathname();
  const moduleId = resolvePortalModule(pathname);
  const [session, setSession] = useState<{ displayName: string; isMaster: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.email) {
          setSession({
            displayName: data.displayName ?? data.email,
            isMaster: Boolean(data.isMaster),
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleNav = PORTAL_TOP_NAV.filter((item) => !item.masterOnly || session?.isMaster);

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
          <TopNavLink key={item.id} item={item} active={moduleId === item.id} />
        ))}
      </nav>

      <div className="portal-topbar-right">
        <ThemeToggle />
        {session ?
          <Link
            href="/config/usuarios"
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

function TopNavLink({ item, active }: { item: PortalTopNavItem; active: boolean }) {
  return (
    <Link
      href={topNavHref(item)}
      className={"portal-topnav-item" + (active ? " portal-topnav-item--active" : "")}
    >
      <span aria-hidden>{item.icon}</span>
      {item.label}
    </Link>
  );
}
