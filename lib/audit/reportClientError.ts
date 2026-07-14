"use client";

const ENDPOINT = "/api/internal/error-log";
/** Throttle de mensagens idênticas (ms). Evita floods de um erro repetitivo. */
const DEDUPE_WINDOW_MS = 8000;
/** Teto de envios por sessão de página, para não inundar o banco em loop. */
const MAX_REPORTS = 200;

const recent = new Map<string, number>();
let sent = 0;

export type ClientErrorReport = {
  level?: "error" | "warn" | "info";
  source?: "client" | "render" | "api";
  message: string;
  stack?: string;
  status?: number;
  method?: string;
  path?: string;
  context?: Record<string, unknown>;
};

export function reportClientError(report: ClientErrorReport): void {
  if (typeof window === "undefined") return;
  const message = (report.message ?? "").toString().trim();
  if (!message) return;
  if (sent >= MAX_REPORTS) return;

  const key = `${report.source ?? "client"}|${report.status ?? ""}|${message.slice(0, 200)}`;
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return;
  recent.set(key, now);
  sent += 1;

  const payload = JSON.stringify({
    level: report.level ?? "error",
    source: report.source ?? "client",
    message: message.slice(0, 4000),
    stack: (report.stack ?? "").slice(0, 8000),
    status: report.status,
    method: report.method,
    path: report.path ?? window.location.pathname + window.location.search,
    context: report.context ?? {},
  });

  try {
    // keepalive permite o envio mesmo durante navegação/unload.
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* nunca propaga */
  }
}

/** Marca URLs que NÃO devem ser logadas (evita loop e ruído de polling). */
export function isIgnoredUrl(url: string): boolean {
  const path = pathFromClientUrl(url);
  return (
    path.startsWith("/api/internal/error-log") ||
    path.startsWith("/api/internal/audit-log") ||
    path.startsWith("/api/auth/me") ||
    path.startsWith("/api/criacao/error-log") ||
    path.startsWith("/api/criacao/fila/sync-pending") ||
    path.startsWith("/api/criacao/download/sync-pending") ||
    url.includes("_rsc=") ||
    url.includes("127.0.0.1:8765") ||
    url.includes("localhost:8765")
  );
}

/** Polling de diagnóstico — falha de rede não vira erro grave no log. */
export function isBackgroundPollUrl(url: string): boolean {
  const path = pathFromClientUrl(url);
  return (
    path.startsWith("/api/criacao/error-log") ||
    path.startsWith("/api/criacao/fila") ||
    path.startsWith("/api/criacao/fila/sync-pending")
  );
}

export function shouldSkipClientErrorReport(
  url: string,
  init?: RequestInit,
  request?: Request,
): boolean {
  if (request?.headers.get("X-Skip-Error-Report") === "1") return true;
  const h = new Headers(init?.headers);
  if (h.get("X-Skip-Error-Report") === "1") return true;
  return isIgnoredUrl(url);
}

function pathFromClientUrl(url: string): string {
  try {
    if (url.startsWith("http")) {
      const u = new URL(url);
      return u.pathname + u.search;
    }
  } catch {
    /* ignore */
  }
  return url.split("#")[0] ?? url;
}
