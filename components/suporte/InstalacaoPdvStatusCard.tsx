"use client";

import { useState } from "react";
import { formatPlayerVersionLabel } from "@/lib/player/formatPlayerVersionLabel";
import type { InstalacaoPdvStatus } from "@/lib/suporte/instalacaoPdvStatusService";

function fmtPing(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function CacheBar({ percent }: { percent: number | null }) {
  const p = percent ?? 0;
  const label = percent == null ? "—" : `${Math.round(p)}%`;
  return (
    <div className="min-w-[5rem]">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Cache músicas
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-fuchsia-500 transition-all"
          style={{ width: `${Math.min(100, Math.max(0, p))}%` }}
        />
      </div>
      <span className="text-[11px] text-zinc-400">{label}</span>
    </div>
  );
}

export function InstalacaoPdvStatusCard({
  status,
  canRegenerarToken,
  onTokenRegenerated,
}: {
  status: InstalacaoPdvStatus;
  canRegenerarToken: boolean;
  onTokenRegenerated?: (newToken: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState(status.playerInstalacaoToken);

  async function regerar() {
    if (!canRegenerarToken || busy) return;
    if (
      !window.confirm(
        "Gera uma nova chave de instalação. O player atual deixa de funcionar e ping/cache deste PDV serão zerados. Continuar?",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/suporte/pdv/${encodeURIComponent(status.rioPdvKey)}/regenerar-token`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        playerInstalacaoToken?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.playerInstalacaoToken) {
        throw new Error(data.error ?? "falhou");
      }
      setToken(data.playerInstalacaoToken);
      onTokenRegenerated?.(data.playerInstalacaoToken);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao regerar token.");
    } finally {
      setBusy(false);
    }
  }

  const versionLabel =
    formatPlayerVersionLabel(status.telemetry.playerVersion ?? status.playerVersion) ?? "—";

  return (
    <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-950/60 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-zinc-100">{status.pdvNome}</p>
          <p className="font-mono text-[11px] text-emerald-400">{status.codigoDisplay}</p>
        </div>
        <span
          className={
            "rounded px-2 py-0.5 text-[10px] font-semibold " +
            (status.statusPlayer === "Ativo"
              ? "bg-emerald-900/40 text-emerald-300"
              : "bg-zinc-800 text-zinc-400")
          }
        >
          Player {status.statusPlayer}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CacheBar percent={status.telemetry.downloadPercent} />
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Token serial
          </p>
          {token ?
            <p className="font-mono text-[11px] text-zinc-300" title={token}>
              {token.slice(0, 12)}…
            </p>
          : <p className="text-[11px] text-zinc-500">sem token</p>}
          {canRegenerarToken ?
            <button
              type="button"
              disabled={busy}
              onClick={() => void regerar()}
              className="mt-1.5 rounded border border-amber-600/60 bg-amber-950/30 px-2 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-950/50 disabled:opacity-50"
            >
              {busy ? "…" : "Regerar token"}
            </button>
          : null}
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            1º ping
          </p>
          <p className="text-[11px] text-zinc-300">{fmtPing(status.telemetry.firstPingAt)}</p>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Últ. ping
          </p>
          <p className="text-[11px] text-zinc-300">{fmtPing(status.telemetry.lastPingAt)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        <span>Versão: {versionLabel}</span>
        {status.programacaoCriacaoNome ?
          <span>Prog.: {status.programacaoCriacaoNome}</span>
        : null}
        {!status.telemetriaDisponivel ?
          <span className="text-sky-400">cloud2 offline — telemetria indisponível</span>
        : null}
      </div>
    </div>
  );
}
