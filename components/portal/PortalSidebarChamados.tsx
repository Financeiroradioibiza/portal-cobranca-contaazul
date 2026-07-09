"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useMyOpenChamados } from "@/components/chamados/ChamadosDashboardWidget";

function StatusBadge({ count, tone }: { count: number; tone: "red" | "orange" }) {
  if (count <= 0) return null;
  return (
    <span
      className={
        tone === "red" ?
          "portal-sidebar-chamados-badge portal-sidebar-chamados-badge-red"
        : "portal-sidebar-chamados-badge portal-sidebar-chamados-badge-orange"
      }
      aria-label={`${count} chamado${count === 1 ? "" : "s"}`}
    >
      {count}
    </span>
  );
}

export function PortalSidebarChamados() {
  const { allItems, loading } = useMyOpenChamados();

  const { aberto, emAndamento } = useMemo(() => {
    let a = 0;
    let e = 0;
    for (const c of allItems) {
      if (c.status === "aberto") a += 1;
      else if (c.status === "em_andamento") e += 1;
    }
    return { aberto: a, emAndamento: e };
  }, [allItems]);

  return (
    <Link href="/chamados" className="portal-sidebar-chamados portal-sidebar-chamados-compact">
      <span className="portal-sidebar-chamados-icon" aria-hidden>
        🎫
      </span>
      <span className="portal-sidebar-chamados-title">Chamados abertos</span>
      {!loading ?
        <span className="portal-sidebar-chamados-badges">
          <StatusBadge count={aberto} tone="red" />
          <StatusBadge count={emAndamento} tone="orange" />
        </span>
      : null}
    </Link>
  );
}
