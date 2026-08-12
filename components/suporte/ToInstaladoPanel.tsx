"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ToInstaladoRow } from "@/lib/suporte/toInstaladoService";
import { formatToInstaladoPrimeiroPing } from "@/lib/suporte/toInstaladoService";

function fmtInstalado(iso: string): string {
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

export function ToInstaladoPanel() {
  const [rows, setRows] = useState<ToInstaladoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/suporte/to-instalado", { credentials: "same-origin" });
      const data = (await res.json()) as {
        ok?: boolean;
        rows?: ToInstaladoRow[];
        synced?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Falha ao carregar.");
      setRows(Array.isArray(data.rows) ? data.rows : []);
      if (typeof data.synced === "number" && data.synced > 0) {
        setMsg(`${data.synced} instalação(ões) sincronizada(s) agora.`);
      }
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
        r.clienteNome,
        r.pdvNome,
        r.cnpj,
        r.codigoDisplay,
        String(r.portalPdvId),
        r.contato,
        fmtInstalado(r.instaladoEm),
        formatToInstaladoPrimeiroPing(r.primeiroPingEm),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, busca]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Cada linha é um PDV que <strong>concluiu a instalação</strong> no Player (quando o app confirma no
        servidor). Ordenado do mais recente para o mais antigo. O 1º ping é preenchido assim que o cloud2
        registra a primeira conexão.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Buscar cliente, PDV, CNPJ, ID…"
          className="min-w-[14rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
          onClick={() => void load()}
        >
          Atualizar
        </button>
      </div>

      {msg ?
        <p className="text-sm text-slate-600 dark:text-slate-400">{msg}</p>
      : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <table className="min-w-[960px] w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Instalado em</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">PDV</th>
              <th className="px-3 py-2">CNPJ</th>
              <th className="px-3 py-2">ID PDV</th>
              <th className="px-3 py-2">1º ping</th>
              <th className="px-3 py-2">Contato</th>
            </tr>
          </thead>
          <tbody>
            {loading ?
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                  Carregando…
                </td>
              </tr>
            : filtrados.length === 0 ?
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                  Nenhuma instalação concluída registrada ainda.
                </td>
              </tr>
            : filtrados.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-100 align-top dark:border-slate-900"
                >
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">
                    {fmtInstalado(r.instaladoEm)}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                    {r.clienteNome}
                  </td>
                  <td className="px-3 py-2">{r.pdvNome}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.cnpj}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold tabular-nums">
                    {r.codigoDisplay}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs">
                    {formatToInstaladoPrimeiroPing(r.primeiroPingEm)}
                  </td>
                  <td className="max-w-[16rem] px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                    {r.contato}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {!loading && filtrados.length > 0 ?
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {filtrados.length} linha(s) · mais recentes primeiro
        </p>
      : null}
    </div>
  );
}
