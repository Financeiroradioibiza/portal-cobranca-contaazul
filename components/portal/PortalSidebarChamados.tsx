"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useMyOpenChamados } from "@/components/chamados/ChamadosDashboardWidget";

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="portal-sidebar-chamados-badge portal-sidebar-chamados-badge-red"
      aria-label={`${count} não lido${count === 1 ? "" : "s"}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function PortalSidebarChamados() {
  const { allItems, loading } = useMyOpenChamados();

  const naoLidos = useMemo(() => {
    let n = 0;
    for (const c of allItems) {
      n += c.unreadCount ?? 0;
    }
    return n;
  }, [allItems]);

  return (
    <Link href="/chamados/kanban" className="portal-sidebar-chamados portal-sidebar-chamados-compact">
      <span className="portal-sidebar-chamados-icon" aria-hidden>
        🎫
      </span>
      <span className="portal-sidebar-chamados-title">Chamados abertos</span>
      {!loading ?
        <span className="portal-sidebar-chamados-badges">
          <UnreadBadge count={naoLidos} />
        </span>
      : null}
    </Link>
  );
}
