"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const TOKEN_KEY = "chamados_app_portal_session";
const RETURN_KEY = "ibizap_return";
const OPEN_PROG_KEY = "criacao-open-prog";

let fetchPatched = false;

export function patchChamadosAppFetchOnce(): void {
  if (fetchPatched || typeof window === "undefined") return;
  const host = window.location.hostname || "";
  if (!host.includes("chamados.") && host !== "localhost") return;

  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  } catch {
    token = null;
  }
  if (!token) return;

  const orig = window.fetch.bind(window);
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const nextInit: RequestInit = init ? { ...init } : {};
    const headers = new Headers(nextInit.headers || {});
    if (!headers.has("Authorization")) {
      headers.set("Authorization", "Bearer " + token);
      headers.set("X-Portal-Session", token);
    }
    nextInit.headers = headers;
    if (!nextInit.credentials) nextInit.credentials = "same-origin";
    return orig(input, nextInit);
  };
  fetchPatched = true;
}

/** Repassa sessão do PWA IbiZap (localStorage) nas APIs quando /m roda em chamados.radioibiza.app.br. */
export function ChamadosAppSessionBootstrap() {
  useEffect(() => {
    patchChamadosAppFetchOnce();
  }, []);

  return null;
}

export function IbiZapReturnBar() {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    try {
      const h = sessionStorage.getItem(RETURN_KEY);
      if (h) setHref(h);
    } catch {
      //
    }
  }, []);

  if (!href) return null;

  const cls =
    "inline-flex items-center gap-1 rounded-full border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-900 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-100";

  const onLeave = () => {
    try {
      sessionStorage.removeItem(RETURN_KEY);
    } catch {
      //
    }
  };

  if (href.startsWith("http")) {
    return (
      <div className="mb-3">
        <a href={href} onClick={onLeave} className={cls}>
          ← Voltar ao IbiZap
        </a>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <Link href={href} onClick={onLeave} className={cls}>
        ← Voltar ao IbiZap
      </Link>
    </div>
  );
}

export { OPEN_PROG_KEY, RETURN_KEY, TOKEN_KEY };
