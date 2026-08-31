"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MigracaoClienteRow,
  MigracaoProgramacaoStatus,
} from "@/lib/suporte/migracaoService";

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

function CheckCell({ ok, title }: { ok: boolean; title: string }) {
  return (
    <td className="px-3 py-2 text-center align-middle">
      <span
        title={title}
        className={
          ok
            ? "inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-base font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
            : "inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-base font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300"
        }
        aria-label={ok ? "Sim" : "Não"}
      >
        {ok ? "✓" : "✗"}
      </span>
    </td>
  );
}

function StatusProgramacaoBadge({ status }: { status: MigracaoProgramacaoStatus }) {
  const cls =
    status === "PRONTA"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
      : status === "CRIADA"
        ? "bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200"
        : "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200";
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

export function MigracaoPanel() {
  const [rows, setRows] = useState<MigracaoClienteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloud2Ok, setCloud2Ok] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/suporte/migracao", { credentials: "same-origin" });
      const data = (await res.json()) as {
        ok?: boolean;
        rows?: MigracaoClienteRow[];
        cloud2Ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Falha ao carregar.");
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setCloud2Ok(Boolean(data.cloud2Ok));
    } catch (e) {
      setRows([]);
      setCloud2Ok(false);
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
        r.clienteNome,
        r.clienteRef,
        r.programacaoNome ?? "",
        r.statusProgramacao,
        r.portalClienteId != null ? String(r.portalClienteId) : "",
        fmtPing(r.ultimoPingEm),
        String(r.pdvsComPing),
        String(r.pdvsSemPing),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, busca]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Clientes com programação musical criada na Criação/Produção — checklist para migração e
        instalação do Player 5. Ordenado pela instalação mais recente (último ping entre os PDVs).
      </p>

      {!cloud2Ok && !loading ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          Cloud2 indisponível — colunas de ping podem estar desatualizadas.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente, programação, status…"
          className="portal-input min-w-[14rem] flex-1"
        />
        <button
          type="button"
          className="portal-btn portal-btn--secondary"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Carregando…" : "Atualizar"}
        </button>
        <span className="text-sm text-slate-500">
          {filtrados.length} cliente{filtrados.length === 1 ? "" : "s"}
        </span>
      </div>

      {msg ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          {msg}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="portal-table w-full min-w-[960px] text-sm">
          <thead>
            <tr>
              <th className="text-left">Cliente</th>
              <th className="text-center whitespace-nowrap">PDVs amarrados?</th>
              <th className="text-center whitespace-nowrap">Programação?</th>
              <th className="text-left whitespace-nowrap">Status programação</th>
              <th className="text-center whitespace-nowrap">Algum PDV instalado?</th>
              <th className="text-center whitespace-nowrap">Falta PDV p/ instalar?</th>
              <th className="text-left whitespace-nowrap">Último ping</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Carregando…
                </td>
              </tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  {rows.length === 0
                    ? "Nenhum cliente com programação criada."
                    : "Nenhum resultado para a busca."}
                </td>
              </tr>
            ) : (
              filtrados.map((row, index) => (
                <tr
                  key={row.clienteRef}
                  className={
                    index % 2 === 1
                      ? "bg-slate-50 dark:bg-slate-800/45"
                      : "bg-white dark:bg-slate-900"
                  }
                >
                  <td className="px-4 py-2 align-top">
                    <div className="font-medium text-slate-800 dark:text-slate-100">
                      {row.clienteNome}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.portalClienteId != null ? `ID ${row.portalClienteId}` : row.clienteRef}
                      {row.programacaoNome ? ` · ${row.programacaoNome}` : null}
                    </div>
                    {row.totalPdvsInstalaveis > 0 ? (
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {row.pdvsComPing}/{row.totalPdvsInstalaveis} PDV
                        {row.totalPdvsInstalaveis === 1 ? "" : "s"} com ping
                      </div>
                    ) : null}
                  </td>
                  <CheckCell
                    ok={row.pdvsAmarrados}
                    title={
                      row.pdvsAmarrados
                        ? "Todos os PDVs instaláveis têm programação amarrada"
                        : "Há PDV instalável sem programação amarrada"
                    }
                  />
                  <CheckCell
                    ok={row.temProgramacao}
                    title={
                      row.temProgramacao
                        ? "Programação musical criada"
                        : "Sem programação criada"
                    }
                  />
                  <td className="px-3 py-2 align-middle">
                    <StatusProgramacaoBadge status={row.statusProgramacao} />
                  </td>
                  <CheckCell
                    ok={row.algumPdvInstalado}
                    title={
                      row.algumPdvInstalado
                        ? "Pelo menos um PDV já fez primeiro ping"
                        : "Nenhum PDV com ping registrado"
                    }
                  />
                  <CheckCell
                    ok={row.faltaPdvInstalar}
                    title={
                      row.faltaPdvInstalar
                        ? "Ainda há PDV sem primeiro ping"
                        : "Todos os PDVs instaláveis já pingaram"
                    }
                  />
                  <td className="whitespace-nowrap px-4 py-2 align-top text-slate-700 dark:text-slate-200">
                    {fmtPing(row.ultimoPingEm)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
