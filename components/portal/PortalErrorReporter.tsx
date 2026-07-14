"use client";

import { useEffect } from "react";
import { reportClientError, shouldSkipClientErrorReport, isBackgroundPollUrl } from "@/lib/audit/reportClientError";

/**
 * Captura erros do navegador e respostas de API com falha, enviando para
 * /api/internal/error-log. Visível depois em Configuração › Erros.
 * Montado uma vez no layout do portal.
 */
export function PortalErrorReporter() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      reportClientError({
        source: "client",
        message: event.message || "Erro de script",
        stack: event.error?.stack ?? `${event.filename}:${event.lineno}:${event.colno}`,
        context: { filename: event.filename, line: event.lineno, col: event.colno },
      });
    }

    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message =
        reason instanceof Error ? reason.message
        : typeof reason === "string" ? reason
        : "Promise rejeitada sem motivo";
      reportClientError({
        source: "client",
        message: `Unhandled rejection: ${message}`,
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    // Wrapper no fetch para registrar respostas com erro (>=400) e falhas de rede.
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input
        : input instanceof URL ? input.toString()
        : input.url;
      const method = (init?.method || (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET") || "GET").toUpperCase();
      const req = typeof input !== "string" && !(input instanceof URL) ? input : undefined;
      const skipReport = shouldSkipClientErrorReport(url, init, req);

      try {
        const res = await originalFetch(input, init);
        if (!res.ok && !skipReport) {
          reportClientError({
            source: "api",
            level: res.status >= 500 ? "error" : "warn",
            status: res.status,
            method,
            message: `HTTP ${res.status} em ${method} ${stripOrigin(url)}`,
            path: stripOrigin(url),
            context: { statusText: res.statusText },
          });
        }
        return res;
      } catch (err) {
        if (!skipReport) {
          const isAbort = err instanceof Error && err.name === "AbortError";
          if (!isAbort) {
            reportClientError({
              source: "api",
              level: isBackgroundPollUrl(url) ? "info" : "error",
              method,
              message: `Falha de rede em ${method} ${stripOrigin(url)}`,
              stack: err instanceof Error ? err.stack : undefined,
              path: stripOrigin(url),
            });
          }
        }
        throw err;
      }
    };

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}

function stripOrigin(url: string): string {
  try {
    if (url.startsWith("http")) {
      const u = new URL(url);
      return u.pathname + u.search;
    }
  } catch {
    /* ignore */
  }
  return url;
}
