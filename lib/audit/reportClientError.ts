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

/** Marca URLs que NÃO devem ser logadas (evita loop e ruído). */
export function isIgnoredUrl(url: string): boolean {
  return (
    url.includes("/api/internal/error-log") ||
    url.includes("/api/internal/audit-log") ||
    url.includes("/api/auth/me") ||
    url.includes("_rsc=") ||
    url.includes("127.0.0.1:8765") ||
    url.includes("localhost:8765")
  );
}
