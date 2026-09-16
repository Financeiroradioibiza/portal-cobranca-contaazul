"use client";

import { useCallback, useEffect, useState } from "react";
import { useCriacaoLiveDiag } from "@/components/criacao/CriacaoLiveDiagContext";

const POLL_HEADERS = { "X-Skip-Error-Report": "1" } as const;

const NOISE_MESSAGE_RE =
  /^Falha de rede em (GET|POST) \/api\/criacao\/(error-log|fila(\/sync-pending)?)/;

function CountBadge({ count, tone }: { count: number; tone: "red" | "orange" | "sky" }) {
  if (count <= 0) return null;
  const cls =
    tone === "red" ? "portal-sidebar-chamados-badge-red"
    : tone === "orange" ? "portal-sidebar-chamados-badge-orange"
    : "portal-sidebar-master-badge-sky";
  return (
    <span className={"portal-sidebar-chamados-badge " + cls} aria-label={`${count}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Master · Criação — liga/desliga o painel flutuante e mostra contadores. */
export function PortalSidebarLiveDiag() {
  const { isMaster, enabled, toggle } = useCriacaoLiveDiag();
  const [errorCount, setErrorCount] = useState(0);
  const [warnCount, setWarnCount] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isMaster) return;
    setLoading(true);
    try {
      const [errRes, filaRes] = await Promise.all([
        fetch("/api/criacao/error-log?pageSize=15", { headers: POLL_HEADERS }),
        fetch("/api/criacao/fila?limit=40", { headers: POLL_HEADERS }),
      ]);
      if (errRes.ok) {
        const data = (await errRes.json()) as {
          logs?: Array<{ level: string; message: string }>;
        };
        const logs = (data.logs ?? []).filter(
          (r) => r.level !== "info" && !NOISE_MESSAGE_RE.test(r.message),
        );
        setErrorCount(logs.filter((r) => r.level === "error").length);
        setWarnCount(logs.filter((r) => r.level === "warn").length);
      }
      if (filaRes.ok) {
        const data = (await filaRes.json()) as { jobs?: Array<{ status: string }> };
        setQueueCount(
          (data.jobs ?? []).filter(
            (j) => j.status === "aguardando" || j.status === "processando" || j.status === "revisao",
          ).length,
        );
      }
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }, [isMaster]);

  useEffect(() => {
    if (!isMaster) return;
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 20000);
    return () => clearInterval(timer);
  }, [isMaster, load]);

  if (!isMaster) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      className={
        "portal-sidebar-master-widget portal-sidebar-master-widget--diag" +
        (enabled ? " portal-sidebar-master-widget--active" : "")
      }
      title={
        enabled ?
          "Diagnóstico ao vivo ativo — clique para desligar"
        : "Clique para ativar o diagnóstico ao vivo no rodapé"
      }
    >
      <span className="portal-sidebar-chamados-icon" aria-hidden>
        🔍
      </span>
      <span className="portal-sidebar-chamados-title">
        Diagnóstico{enabled ? " · on" : ""}
      </span>
      {!loading ?
        <span className="portal-sidebar-chamados-badges">
          <CountBadge count={queueCount} tone="sky" />
          <CountBadge count={errorCount} tone="red" />
          <CountBadge count={warnCount} tone="orange" />
        </span>
      : null}
    </button>
  );
}
