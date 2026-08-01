/** Rotas em background — não disparam overlay global. */
export const PORTAL_PROCESSING_SILENT_PATHS = new Set([
  "/api/criacao/download/sync-pending",
]);

export type PortalFetchInit = RequestInit & {
  /** Não incrementa o overlay global (sync em background, etc.). */
  portalSilent?: boolean;
};

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function resolvePortalFetchMeta(
  input: RequestInfo | URL,
  init?: PortalFetchInit,
): { path: string; method: string; silent: boolean } {
  let path = "";
  let method = "GET";
  let silent = Boolean(init?.portalSilent);

  if (typeof input === "string") {
    try {
      const u =
        input.startsWith("http") ? new URL(input) : new URL(input, "http://local");
      path = u.pathname;
    } catch {
      path = input.split("?")[0] ?? input;
    }
    method = (init?.method ?? "GET").toUpperCase();
  } else if (input instanceof URL) {
    path = input.pathname;
    method = (init?.method ?? "GET").toUpperCase();
  } else {
    try {
      path = new URL(input.url).pathname;
    } catch {
      path = "";
    }
    method = input.method.toUpperCase();
    silent = silent || input.headers.get("x-portal-processing-silent") === "1";
  }

  if (PORTAL_PROCESSING_SILENT_PATHS.has(path)) silent = true;

  return { path, method, silent };
}

/** POST/PUT/PATCH/DELETE em `/api/*` do portal — overlay global. */
export function shouldTrackPortalFetch(
  input: RequestInfo | URL,
  init?: PortalFetchInit,
): boolean {
  const { path, method, silent } = resolvePortalFetchMeta(input, init);
  if (silent) return false;
  if (!path.startsWith("/api/")) return false;
  return MUTATING.has(method);
}
