"use client";

import Link from "next/link";
import { ENVIOS_MANUAIS_EXTERNAL_URL } from "@/lib/portal/enviosManuaisUrl";

export function EnviosManuaisEmbedPanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
        Agendamentos de cobrança (boleto + NFS-e) via Conta Azul. O painel roda na{" "}
        <strong>Vercel</strong> — login próprio abaixo; cron e envios automáticos continuam lá até
        migração completa.{" "}
        <Link
          href={ENVIOS_MANUAIS_EXTERNAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline"
        >
          Abrir em nova aba
        </Link>
      </p>
      <div className="min-h-[min(78vh,calc(100dvh-12rem))] flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <iframe
          title="Envios manuais — Radio Ibiza"
          src={ENVIOS_MANUAIS_EXTERNAL_URL}
          className="h-[min(78vh,calc(100dvh-12rem))] w-full border-0"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
