export type PortalNoticeSeverity = "info" | "success" | "error";

export type ServerErrorDebug = {
  id?: string;
  at?: string;
  route?: string;
  ym?: number;
  linhaId?: string;
  name?: string;
  message?: string;
  prismaCode?: string;
  detail?: string;
  stack?: string;
  extra?: Record<string, unknown>;
};

export type ErrorDebugReport = {
  reportId: string;
  generatedAt: string;
  portal: {
    page: string;
    href: string;
    userAgent: string;
  };
  action: {
    label: string;
    method: string;
    url: string;
    requestBody?: unknown;
  };
  response: {
    ok: boolean;
    status: number;
    parseError: boolean;
    json: unknown;
    rawTextPreview: string;
    rawTextLength: number;
  };
  context?: Record<string, unknown>;
  server?: ServerErrorDebug;
  client?: {
    name?: string;
    message?: string;
    stack?: string;
  };
  hints?: string[];
};

export type PortalNotice = {
  message: string;
  severity?: PortalNoticeSeverity;
  debug?: ErrorDebugReport;
};

export type BuildHttpErrorReportInput = {
  action: string;
  method: string;
  url: string;
  userMessage: string;
  ok: boolean;
  status: number;
  parseError?: boolean;
  rawText?: string;
  data?: unknown;
  requestBody?: unknown;
  context?: Record<string, unknown>;
  server?: ServerErrorDebug;
  clientError?: unknown;
  pageHref?: string;
  userAgent?: string;
  hints?: string[];
};

function newReportId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `dbg_${t}_${r}`;
}

function serializeClientError(e: unknown): ErrorDebugReport["client"] | undefined {
  if (!(e instanceof Error)) return undefined;
  return {
    name: e.name,
    message: e.message,
    stack: e.stack,
  };
}

function previewRawText(rawText: string, max = 4000): { preview: string; length: number } {
  const length = rawText.length;
  if (length <= max) return { preview: rawText, length };
  return {
    preview: `${rawText.slice(0, max)}\n\n… [truncado: ${length - max} caracteres a mais]`,
    length,
  };
}

export function buildHttpErrorReport(input: BuildHttpErrorReportInput): ErrorDebugReport {
  const raw = input.rawText ?? "";
  const { preview, length } = previewRawText(raw);
  return {
    reportId: input.server?.id ?? newReportId(),
    generatedAt: new Date().toISOString(),
    portal: {
      page: "planilha-rio",
      href: input.pageHref ?? "",
      userAgent: input.userAgent ?? "",
    },
    action: {
      label: input.action,
      method: input.method,
      url: input.url,
      requestBody: input.requestBody,
    },
    response: {
      ok: input.ok,
      status: input.status,
      parseError: input.parseError ?? false,
      json: input.data ?? null,
      rawTextPreview: preview,
      rawTextLength: length,
    },
    context: input.context,
    server: input.server,
    client: serializeClientError(input.clientError),
    hints: input.hints,
  };
}

export function extractServerDebug(data: unknown): ServerErrorDebug | undefined {
  if (!data || typeof data !== "object" || !("debug" in data)) return undefined;
  const d = (data as { debug?: unknown }).debug;
  if (!d || typeof d !== "object") return undefined;
  return d as ServerErrorDebug;
}

export function downloadDebugReport(report: ErrorDebugReport): void {
  const json = JSON.stringify(report, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `portal-debug-${report.reportId}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function copyDebugReport(report: ErrorDebugReport): Promise<boolean> {
  const json = JSON.stringify(report, null, 2);
  try {
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    return false;
  }
}
