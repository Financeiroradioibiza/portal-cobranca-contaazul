"use client";

import { useEffect, useState } from "react";
import { reportClientError } from "@/lib/audit/reportClientError";

export default function PortalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    reportClientError({
      source: "render",
      message: error.message || "Erro ao renderizar a página",
      stack: error.stack,
      context: { digest: error.digest },
    });
  }, [error]);

  const details = [
    error.message,
    error.digest ? `digest: ${error.digest}` : "",
    error.stack ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="portal-page">
      <div className="portal-page-body">
        <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950/40">
          <div className="text-[10px] font-bold uppercase tracking-widest text-red-500">Erro</div>
          <h1 className="mt-1 text-xl font-bold text-red-900 dark:text-red-200">
            Algo quebrou nesta tela
          </h1>
          <p className="mt-2 text-sm text-red-800 dark:text-red-300">
            O erro foi registrado em <strong>Configuração › Erros</strong>. Você pode copiar os
            detalhes abaixo e me mandar para eu corrigir.
          </p>

          <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-white/70 p-3 font-mono text-[11px] text-red-900 dark:bg-black/30 dark:text-red-200">
            {details}
          </pre>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
            >
              Tentar de novo
            </button>
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-900/40"
            >
              {copied ? "Copiado!" : "Copiar detalhes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
