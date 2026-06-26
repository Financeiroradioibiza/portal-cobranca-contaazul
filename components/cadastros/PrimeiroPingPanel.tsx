"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PrimeiroPingRow } from "@/lib/cadastros/primeiroPingService";
import { formatPortalPdvIdDisplay } from "@/lib/player/portalPlayerIds";

function fmtPrimeiroPing(iso: string): string {
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

function pdvLabel(row: PrimeiroPingRow): string {
  const nome = row.pdvNome.trim() || "PDV";
  const codigo = row.codigoDisplay?.trim() || formatPortalPdvIdDisplay(row.pdvId);
  return `${nome} (${codigo})`;
}

export function PrimeiroPingPanel() {
  const [rows, setRows] = useState<PrimeiroPingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cadastros/primeiro-ping", { credentials: "same-origin" });
      const data = (await res.json()) as { ok?: boolean; rows?: PrimeiroPingRow[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Falha ao carregar.");
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e) {
      setRows([]);
      setMsg(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.rowId,
        r.pdvNome,
        r.codigoDisplay ?? "",
        String(r.pdvId),
        r.clienteNome,
        String(r.clienteId),
        fmtPrimeiroPing(r.firstPingAt),
        r.ativo ? "instalação atual" : "instalação anterior",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, busca]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Histórico de primeiros pings do Player 5 por instalação. Ao regerar a chave do PDV, o ping
        anterior permanece na lista — assim dá para ver quando aquele ponto foi instalado pela
        primeira vez, não só a reinstalação mais recente.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar PDV, cliente, ID ou data…"
          className="portal-input min-w-[14rem] flex-1"
        />
        <button type="button" className="portal-btn portal-btn--secondary" disabled={loading} onClick={() => void load()}>
          {loading ? "Carregando…" : "Atualizar"}
        </button>
        <span className="text-sm text-slate-500">
          {filtrados.length} registro{filtrados.length === 1 ? "" : "s"}
        </span>
      </div>

      {msg ?
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          {msg}
        </p>
      : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="portal-table w-full min-w-[640px] text-sm">
          <thead>
            <tr>
              <th className="text-left">PDV</th>
              <th className="text-left">Cliente</th>
              <th className="text-left whitespace-nowrap">Primeiro ping</th>
            </tr>
          </thead>
          <tbody>
            {loading ?
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                  Carregando…
                </td>
              </tr>
            : filtrados.length === 0 ?
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                  {rows.length === 0 ?
                    "Nenhum PDV com primeiro ping registrado ainda."
                  : "Nenhum resultado para a busca."}
                </td>
              </tr>
            : filtrados.map((row, index) => (
                <tr
                  key={row.rowId || `${row.pdvId}-${row.firstPingAt}`}
                  className={
                    index % 2 === 1 ?
                      "bg-slate-50 dark:bg-slate-800/45"
                    : "bg-white dark:bg-slate-900"
                  }
                >
                  <td className="px-4 py-2 align-top">
                    <div className="font-medium text-slate-800 dark:text-slate-100">{pdvLabel(row)}</div>
                    <div className="text-xs text-slate-500">ID Player {row.pdvId}</div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <div className="text-slate-800 dark:text-slate-100">{row.clienteNome.trim() || "—"}</div>
                    <div className="text-xs text-slate-500">ID {row.clienteId}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 align-top text-slate-700 dark:text-slate-200">
                    <div>{fmtPrimeiroPing(row.firstPingAt)}</div>
                    {row.ativo ?
                      <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                        Instalação atual
                      </div>
                    : null}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
