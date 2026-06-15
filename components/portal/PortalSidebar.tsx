"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PORTAL_SIDEBARS,
  isSidebarActive,
  resolvePortalModule,
} from "@/lib/portal/portalNav";

export function PortalSidebar() {
  const pathname = usePathname();
  const moduleId = resolvePortalModule(pathname);
  const menu = PORTAL_SIDEBARS[moduleId];

  return (
    <aside className="portal-sidebar" aria-label="Submenu">
      <div className="portal-sidebar-section">
        <div className="portal-sidebar-heading">{menu.section}</div>
        {menu.items.map((item) => {
          const active = isSidebarActive(pathname, item.href);
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
              {item.label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
