"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function PortalModuleLinks() {
  const [isMaster, setIsMaster] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.isMaster) setIsMaster(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Link
        href="/cobranca/planilha-rio"
        className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Cobrança
      </Link>
      <Link
        href="/cadastros/grupos"
        className="rounded-md px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/50"
      >
        Cadastros
      </Link>
      <Link
        href="/producao/dashboard"
        className="rounded-md px-2 py-1 text-[11px] font-medium text-fuchsia-700 hover:bg-fuchsia-50 dark:text-fuchsia-300 dark:hover:bg-fuchsia-950/50"
      >
        Produção
      </Link>
      {isMaster ?
        <Link
          href="/config/usuarios"
          className="rounded-md px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/50"
        >
          Config
        </Link>
      : null}
    </>
  );
}
