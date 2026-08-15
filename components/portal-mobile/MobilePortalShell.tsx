"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  PORTAL_SIDEBARS,
  PORTAL_TOP_NAV,
  filterSidebarItems,
  filterTopNav,
  isSidebarActive,
  resolvePortalModule,
  topNavHref,
  type PortalSidebarItem,
  type PortalTopNavItem,
} from "@/lib/portal/portalNav";
import type { PortalPermissionsMap } from "@/lib/portal/menuPermissions";
import {
  stripMobilePortalPrefix,
  toMobilePortalHref,
  toDesktopPortalPath,
} from "@/lib/portal/mobilePaths";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PortalErrorReporter } from "@/components/portal/PortalErrorReporter";

type MeResponse = {
  email?: string;
  displayName?: string;
  isMaster?: boolean;
  fluxoRafaelAdmin?: boolean;
  menuPermissions?: PortalPermissionsMap | "all";
};

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "RI";
}

function SidebarLink({
  item,
  pathname,
  onNavigate,
}: {
  item: PortalSidebarItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  if (item.separator) {
    return <hr className="my-2 border-slate-200 dark:border-slate-700" />;
  }
  if (item.soon || !item.href) {
    return (
      <div className="px-3 py-2 text-xs text-slate-400">
        {item.icon} {item.label} (em breve)
      </div>
    );
  }
  const active = isSidebarActive(pathname, item.href, item.exact);
  return (
    <Link
      href={toMobilePortalHref(item.href)}
      onClick={onNavigate}
      className={
        "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition " +
        (active ?
          "bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-200"
        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800")
      }
    >
      <span aria-hidden>{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  );
}

function BottomTab({
  item,
  perm,
  active,
}: {
  item: PortalTopNavItem;
  perm: PortalPermissionsMap | "all";
  active: boolean;
}) {
  const href = toMobilePortalHref(topNavHref(item, perm));
  return (
    <Link
      href={href}
      className={
        "flex min-w-[4.25rem] flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-semibold transition " +
        (active ?
          "text-orange-600 dark:text-orange-400"
        : "text-slate-500 dark:text-slate-400")
      }
    >
      <span className="text-base leading-none" aria-hidden>
        {item.icon}
      </span>
      <span className="max-w-[4.5rem] truncate">{item.label.split(" ")[0]}</span>
    </Link>
  );
}

export function MobilePortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/m";
  const router = useRouter();
  const desktopPath = stripMobilePortalPrefix(pathname);
  const moduleId = resolvePortalModule(desktopPath);
  const sidebar = PORTAL_SIDEBARS[moduleId];

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [session, setSession] = useState<{
    displayName: string;
    isMaster: boolean;
    fluxoRafaelAdmin: boolean;
    menuPermissions: PortalPermissionsMap | "all";
  } | null>(null);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MeResponse | null) => {
        if (!cancelled && data?.email) {
          setSession({
            displayName: data.displayName ?? data.email,
            isMaster: Boolean(data.isMaster),
            fluxoRafaelAdmin: Boolean(data.fluxoRafaelAdmin),
            menuPermissions: data.menuPermissions ?? {},
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const perm = session?.menuPermissions ?? {};
  const visibleNav = useMemo(
    () => filterTopNav(PORTAL_TOP_NAV, perm, { isMaster: session?.isMaster }),
    [perm, session?.isMaster],
  );
  const visibleSidebar = useMemo(
    () =>
      filterSidebarItems(sidebar.items, perm).filter(
        (item) => !item.fluxoRafaelOnly || session?.fluxoRafaelAdmin,
      ),
    [sidebar.items, perm, session?.fluxoRafaelAdmin],
  );

  const desktopUrl = `${toDesktopPortalPath(pathname)}?desktop=1`;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#f4f6f9] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <PortalErrorReporter />
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 safe-area-pt">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 dark:border-slate-700 dark:text-slate-300"
            aria-label="Abrir menu"
          >
            ☰
          </button>
          <Link href="/m" className="min-w-0 flex-1 truncate">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Radio Ibiza</div>
            <div className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{sidebar.section}</div>
          </Link>
          <ThemeToggle />
          {session ?
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white"
              title={session.displayName}
            >
              {userInitials(session.displayName)}
            </div>
          : null}
        </div>
      </header>

      <main className="mx-auto min-h-0 w-full max-w-lg flex-1 overflow-x-hidden px-3 py-3 pb-24">{children}</main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 safe-area-pb"
        aria-label="Módulos"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around gap-0.5 overflow-x-auto px-1 py-1">
          {visibleNav.map((item) => (
            <BottomTab key={item.id} item={item} perm={perm} active={moduleId === item.id} />
          ))}
        </div>
      </nav>

      {drawerOpen ?
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Fechar menu"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute bottom-0 left-0 right-0 max-h-[78dvh] overflow-auto rounded-t-2xl bg-white p-4 shadow-xl dark:bg-slate-900 safe-area-pb">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{sidebar.section}</h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-slate-500"
              >
                Fechar
              </button>
            </div>
            <nav className="space-y-1">
              {visibleSidebar.map((item, i) => (
                <SidebarLink
                  key={item.href ?? item.label ?? `sep-${i}`}
                  item={item}
                  pathname={desktopPath}
                  onNavigate={() => setDrawerOpen(false)}
                />
              ))}
            </nav>
            <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
              <a
                href={desktopUrl}
                className="block rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
              >
                Ver versão desktop
              </a>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).then(() => {
                    router.replace("/m/login");
                  });
                }}
              >
                <button
                  type="submit"
                  className="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Sair
                </button>
              </form>
            </div>
          </aside>
        </div>
      : null}
    </div>
  );
}
