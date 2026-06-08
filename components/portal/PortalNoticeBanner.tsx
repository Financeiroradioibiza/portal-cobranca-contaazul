"use client";

import { useMemo, useState } from "react";
import {
  copyDebugReport,
  downloadDebugReport,
  type PortalNotice,
} from "@/lib/portal/errorDebugReport";

type Props = {
  notice: PortalNotice | null;
  clashNavLinhaId?: string | null;
  onGoToClashLine?: (linhaId: string) => void;
};

function severityClasses(severity: PortalNotice["severity"]): string {
  if (severity === "error") {
    return "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100";
  }
  if (severity === "success") {
    return "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100";
  }
  return "border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
}

export function PortalNoticeBanner({ notice, clashNavLinhaId, onGoToClashLine }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const debugJson = useMemo(() => {
    if (!notice?.debug) return "";
    return JSON.stringify(notice.debug, null, 2);
  }, [notice?.debug]);

  if (!notice) return null;

  const hasDebug = Boolean(notice.debug);

  return (
    <div className={`mb-3 rounded-md border px-3 py-2 text-sm ${severityClasses(notice.severity)}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span>{notice.message}</span>
            {clashNavLinhaId && onGoToClashLine ?
              <button
                type="button"
                className="shrink-0 rounded border border-amber-500 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-100"
                onClick={() => onGoToClashLine(clashNavLinhaId)}
              >
                Ir para a linha
              </button>
            : null}
          </div>
          {hasDebug ?
            <p className="mt-1 text-xs opacity-80">
              ID debug: <code className="font-mono">{notice.debug!.reportId}</code>
              {notice.debug!.server?.route ?
                <>
                  {" "}
                  · rota <code className="font-mono">{notice.debug!.server.route}</code>
                </>
              : null}
            </p>
          : null}
        </div>

        {hasDebug ?
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="rounded border border-current/30 px-2 py-0.5 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Ocultar debug" : "Ver debug"}
            </button>
            <button
              type="button"
              className="rounded border border-current/30 px-2 py-0.5 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => {
                void copyDebugReport(notice.debug!).then((ok) => {
                  setCopied(ok);
                  if (ok) setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              {copied ? "Copiado!" : "Copiar JSON"}
            </button>
            <button
              type="button"
              className="rounded border border-current/30 px-2 py-0.5 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => downloadDebugReport(notice.debug!)}
            >
              Baixar .json
            </button>
          </div>
        : null}
      </div>

      {hasDebug && expanded ?
        <pre className="mt-2 max-h-80 overflow-auto rounded border border-current/20 bg-black/5 p-2 font-mono text-[11px] leading-relaxed dark:bg-black/30">
          {debugJson}
        </pre>
      : null}
    </div>
  );
}
