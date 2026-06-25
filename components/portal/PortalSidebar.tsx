"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  PORTAL_SIDEBARS,
  isSidebarActive,
  resolvePortalModule,
} from "@/lib/portal/portalNav";
import { PortalSidebarChamados } from "@/components/portal/PortalSidebarChamados";

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "RI";
}

export function PortalSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const moduleId = resolvePortalModule(pathname);
  const menu = PORTAL_SIDEBARS[moduleId];
  const [session, setSession] = useState<{ displayName: string; email: string; isMaster: boolean } | null>(
    null,
  );
  const [loggingOut, setLoggingOut] = useState(false);
  const [atlCadastrosPendentes, setAtlCadastrosPendentes] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.email) {
          setSession({
            email: data.email,
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

  useEffect(() => {
    if (moduleId !== "cadastros") return;
    let cancelled = false;
    fetch("/api/cadastros/atualizacoes/count", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.count === "number") {
          setAtlCadastrosPendentes(Math.max(0, data.count));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [moduleId, pathname]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number }>).detail;
      if (typeof detail?.count === "number") {
        setAtlCadastrosPendentes(Math.max(0, detail.count));
      }
    };
    window.addEventListener("atl-cadastros-pending-changed", handler);
    return () => window.removeEventListener("atl-cadastros-pending-changed", handler);
  }, []);

  const onLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      router.replace("/login");
      router.refresh();
    } catch {
      window.location.href = "/login";
    } finally {
      setLoggingOut(false);
    }
  }, [router]);

  return (
    <aside className="portal-sidebar" aria-label="Submenu">
      <div className="portal-sidebar-section">
        <div className="portal-sidebar-heading">{menu.section}</div>
        {menu.items.map((item) => {
          const active = isSidebarActive(pathname, item.href, item.exact);
          if (item.soon) {
            return (
              <span key={item.href} className="portal-sidebar-item portal-sidebar-item--disabled" title="Em breve">
                <span className="portal-sidebar-icon" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </span>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={"portal-sidebar-item" + (active ? " portal-sidebar-item--active" : "")}
            >
              <span className="portal-sidebar-icon" aria-hidden>
                {item.icon}
              </span>
              <span className="portal-sidebar-item-label">{item.label}</span>
              {item.href === "/cadastros/atualizacoes" && atlCadastrosPendentes > 0 ?
                <span className="portal-sidebar-item-badge" aria-label={`${atlCadastrosPendentes} pendente(s)`}>
                  {atlCadastrosPendentes > 99 ? "99+" : atlCadastrosPendentes}
                </span>
              : null}
            </Link>
          );
        })}
      </div>

      <PortalSidebarChamados />

      {session ?
        <div className="portal-sidebar-footer">
          <Link
            href="/config/usuarios"
            className="portal-sidebar-user"
            title={session.email}
          >
            <span className="portal-sidebar-user-avatar" aria-hidden>
              {userInitials(session.displayName)}
            </span>
            <span className="portal-sidebar-user-meta">
              <span className="portal-sidebar-user-name">{session.displayName}</span>
              <span className="portal-sidebar-user-email">{session.email}</span>
            </span>
          </Link>
          <button
            type="button"
            className="portal-sidebar-logout"
            disabled={loggingOut}
            onClick={() => void onLogout()}
          >
            {loggingOut ? "Saindo…" : "Sair"}
          </button>
        </div>
      : null}
    </aside>
  );
}
