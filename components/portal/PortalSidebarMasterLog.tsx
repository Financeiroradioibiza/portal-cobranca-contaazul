"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isUnauthorizedPollResponse,
  POLL_SKIP_REPORT_HEADERS,
} from "@/lib/portal/backgroundPoll";

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="portal-sidebar-chamados-badge portal-sidebar-chamados-badge-red"
      aria-label={`${count} erro${count === 1 ? "" : "s"}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Master — atalho para Config › Erros com contador (estilo chamados). */
export function PortalSidebarMasterLog({ isMaster }: { isMaster: boolean }) {
  const [errorTotal, setErrorTotal] = useState(0);
  const [warnTotal, setWarnTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const pollStoppedRef = useRef(false);

  const load = useCallback(async () => {
    if (!isMaster || pollStoppedRef.current) return;
    setLoading(true);
    try {
      const [errRes, warnRes] = await Promise.all([
        fetch("/api/config/error-log?pageSize=1&level=error", { headers: POLL_SKIP_REPORT_HEADERS }),
        fetch("/api/config/error-log?pageSize=1&level=warn", { headers: POLL_SKIP_REPORT_HEADERS }),
      ]);
      if (isUnauthorizedPollResponse(errRes) || isUnauthorizedPollResponse(warnRes)) {
        pollStoppedRef.current = true;
        return;
      }
      if (errRes.ok) {
        const data = (await errRes.json()) as { total?: number };
        setErrorTotal(typeof data.total === "number" ? data.total : 0);
      }
      if (warnRes.ok) {
        const data = (await warnRes.json()) as { total?: number };
        setWarnTotal(typeof data.total === "number" ? data.total : 0);
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
    }, 30000);
    return () => clearInterval(timer);
  }, [isMaster, load]);

  if (!isMaster) return null;

  return (
    <Link href="/config/erros" className="portal-sidebar-master-widget portal-sidebar-master-widget--log">
      <span className="portal-sidebar-chamados-icon" aria-hidden>
        📋
      </span>
      <span className="portal-sidebar-chamados-title">LOG</span>
      {!loading ?
        <span className="portal-sidebar-chamados-badges">
          <CountBadge count={errorTotal} />
          {warnTotal > 0 ?
            <span
              className="portal-sidebar-chamados-badge portal-sidebar-chamados-badge-orange"
              aria-label={`${warnTotal} aviso${warnTotal === 1 ? "" : "s"}`}
            >
              {warnTotal > 99 ? "99+" : warnTotal}
            </span>
          : null}
        </span>
      : null}
    </Link>
  );
}
