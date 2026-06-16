"use client";

import Link from "next/link";
import { CHAMADO_COLUNAS, prioridadeMeta } from "@/lib/chamados/chamadoConstants";
import { useMyOpenChamados } from "@/components/chamados/ChamadosDashboardWidget";

export function PortalSidebarChamados() {
  const { items, loading, count } = useMyOpenChamados(5);

  return (
    <div className="portal-sidebar-chamados">
      <div className="portal-sidebar-chamados-head">
        <span className="portal-sidebar-chamados-icon" aria-hidden>
          🎫
        </span>
        <div className="min-w-0 flex-1">
          <p className="portal-sidebar-chamados-title">Chamados abertos</p>
          <p className="portal-sidebar-chamados-sub">Você ou seu setor</p>
        </div>
        {!loading ?
          <span className="portal-sidebar-chamados-count">{count}</span>
        : null}
      </div>

      {loading ?
        <p className="portal-sidebar-chamados-empty">Carregando…</p>
      : count === 0 ?
        <p className="portal-sidebar-chamados-empty">
          Nenhum chamado aberto.{" "}
          <Link href="/chamados" className="portal-sidebar-chamados-link">
            Abrir quadro
          </Link>
        </p>
      : <ul className="portal-sidebar-chamados-list">
          {items.map((c) => {
            const pri = prioridadeMeta(c.prioridade);
            const col = CHAMADO_COLUNAS.find((x) => x.id === c.status);
            return (
              <li key={c.id}>
                <Link href="/chamados" className="portal-sidebar-chamados-item" title={c.titulo}>
                  <span
                    className={"portal-sidebar-chamados-dot " + pri.dot}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="portal-sidebar-chamados-item-title">{c.titulo}</span>
                    <span className="portal-sidebar-chamados-item-meta">
                      {col?.label ?? c.status} · {pri.label}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      }

      {count > 0 ?
        <Link href="/chamados" className="portal-sidebar-chamados-all">
          Ver todos →
        </Link>
      : null}
    </div>
  );
}
