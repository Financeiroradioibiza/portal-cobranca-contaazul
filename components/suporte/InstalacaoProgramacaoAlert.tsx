"use client";

import type { InstalacaoProgramacaoAlert } from "@/lib/suporte/instalacaoPdvStatusService";

export function InstalacaoProgramacaoAlertBanner({
  alert,
  bloqueiaGeracao,
}: {
  alert: InstalacaoProgramacaoAlert | null;
  /** Quando true, exibe aviso de que a geração de link/código está bloqueada. */
  bloqueiaGeracao?: boolean;
}) {
  if (!alert || alert.nivel === "ok") return null;

  const isRed = alert.nivel === "vermelho";
  const border = isRed ? "border-red-700/70" : "border-amber-600/70";
  const bg = isRed ? "bg-red-950/35" : "bg-amber-950/30";
  const title = isRed ? "text-red-200" : "text-amber-100";
  const body = isRed ? "text-red-100/90" : "text-amber-100/90";
  const badge = isRed ? "bg-red-900/50 text-red-200" : "bg-amber-900/45 text-amber-200";

  return (
    <div className={`mt-3 rounded-lg border px-3 py-2.5 text-sm ${border} ${bg}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className={`font-semibold ${title}`}>{alert.titulo}</p>
        <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge}`}>
          {bloqueiaGeracao ? "Geração bloqueada" : "Falar com produção!"}
        </span>
      </div>
      <p className={`mt-1 text-[13px] ${body}`}>{alert.mensagem}</p>
      {bloqueiaGeracao ?
        <p className={`mt-2 text-[12px] font-medium ${body}`}>
          Não é possível gerar link ou código até amarrar e publicar a programação deste PDV.
        </p>
      : null}
      {alert.programacaoNome ?
        <p className="mt-1 text-[11px] text-zinc-400">Programação: {alert.programacaoNome}</p>
      : null}
    </div>
  );
}
