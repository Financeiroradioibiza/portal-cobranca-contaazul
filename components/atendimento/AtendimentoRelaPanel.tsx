"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { PdvCadastroDrawer } from "@/components/cadastros/PdvCadastroDrawer";
import { formatYearMonthLabel } from "@/lib/manualReminders/yearMonth";
import { formatRioPrimeiroPing } from "@/lib/rio/enrichRioLinhasPrimeiroPing";
import type {
  AtendimentoRelaPayload,
  RelaFinanceiroClienteRow,
  RelaProducaoClienteRow,
} from "@/lib/atendimento/relaService";

type Modo = "financeiro" | "producao";

function matchQ(text: string, q: string): boolean {
  if (!q.trim()) return true;
  return text.toLowerCase().includes(q.trim().toLowerCase());
}

function filterFinanceiro(rows: RelaFinanceiroClienteRow[], q: string): RelaFinanceiroClienteRow[] {
  if (!q.trim()) return rows;
  return rows.filter(
    (r) =>
      matchQ(r.marcaBloco, q) ||
      matchQ(r.cliente, q) ||
      matchQ(r.cnpj, q) ||
      matchQ(r.emailCobranca, q) ||
      r.pdvs.some((p) => matchQ(p.nome, q)),
  );
}

function filterProducao(rows: RelaProducaoClienteRow[], q: string): RelaProducaoClienteRow[] {
  if (!q.trim()) return rows;
  return rows.filter(
    (r) =>
      matchQ(r.nome, q) ||
      matchQ(r.documento ?? "", q) ||
      r.pdvs.some((p) => matchQ(p.nome, q) || matchQ(p.portalPdvLabel ?? "", q)),
  );
}

export function AtendimentoRelaPanel() {
  const [modo, setModo] = useState<Modo>("financeiro");
  const [data, setData] = useState<AtendimentoRelaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [openClientes, setOpenClientes] = useState<Set<string>>(new Set());
  const [cadastroPdvKey, setCadastroPdvKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/atendimento/rela");
      const json = (await res.json()) as AtendimentoRelaPayload & { error?: string; ok?: boolean };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Falha ao carregar Rela.");
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro de conexão.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const financeiro = useMemo(
    () => filterFinanceiro(data?.financeiro ?? [], q),
    [data?.financeiro, q],
  );
  const producao = useMemo(() => filterProducao(data?.producao ?? [], q), [data?.producao, q]);

  function toggleCliente(id: string) {
    setOpenClientes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setModo("financeiro")}
            className={
              "rounded-md px-3 py-1.5 text-sm font-semibold transition " +
              (modo === "financeiro" ?
                "bg-amber-100 text-amber-950 shadow-sm dark:bg-amber-950/50 dark:text-amber-100"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100")
            }
          >
            Clientes financeiro
          </button>
          <button
            type="button"
            onClick={() => setModo("producao")}
            className={
              "rounded-md px-3 py-1.5 text-sm font-semibold transition " +
              (modo === "producao" ?
                "bg-violet-100 text-violet-950 shadow-sm dark:bg-violet-950/50 dark:text-violet-100"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100")
            }
          >
            Clientes produção
          </button>
        </div>

        {data ?
          <span className="text-xs text-zinc-500">
            Espelho Rio: {formatYearMonthLabel(data.yearMonth)}
          </span>
        : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            className="portal-input min-w-[200px] text-sm"
            placeholder="Buscar cliente, CNPJ, PDV…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" className="portal-btn text-sm" disabled={loading} onClick={() => void load()}>
            {loading ? "…" : "Atualizar"}
          </button>
        </div>
      </div>

      {err ?
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </div>
      : null}

      {loading && !data ?
        <p className="text-sm text-zinc-500">Carregando…</p>
      : null}

      {modo === "financeiro" ?
        <div className="overflow-hidden rounded-xl border border-amber-200 bg-white dark:border-amber-900/50 dark:bg-zinc-900">
          <div className="border-b border-amber-100 bg-amber-50/80 px-4 py-2 dark:border-amber-900/40 dark:bg-amber-950/20">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
              Planilha Rio · financeiro
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
              {financeiro.length} cliente(s) · somente leitura
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-[11px] uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60">
                  <th className="px-3 py-2">Marca bloco</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">CNPJ</th>
                  <th className="px-3 py-2">Valor</th>
                  <th className="px-3 py-2">Nº PDV</th>
                  <th className="px-3 py-2">E-mail cobrança</th>
                  <th className="px-3 py-2">1º ping</th>
                </tr>
              </thead>
              <tbody>
                {financeiro.length === 0 ?
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                : financeiro.map((row) => {
                    const open = openClientes.has(row.id);
                    const hasPdvs = row.pdvs.length > 0;
                    return (
                      <Fragment key={row.id}>
                        <tr className="border-b border-zinc-100 hover:bg-zinc-50/80 dark:border-zinc-800 dark:hover:bg-zinc-800/40">
                          <td className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-200">
                            {row.marcaBloco}
                          </td>
                          <td className="px-3 py-2">
                            {hasPdvs ?
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
                                onClick={() => toggleCliente(row.id)}
                              >
                                <span className="text-zinc-400">{open ? "▾" : "▸"}</span>
                                {row.cliente}
                              </button>
                            : <span className="font-semibold">{row.cliente}</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-300">
                            {row.cnpj}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.valor}</td>
                          <td className="px-3 py-2 tabular-nums">{row.nPdvs}</td>
                          <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                            {row.emailCobranca}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">
                            {formatRioPrimeiroPing(row.primeiroPingEm)}
                          </td>
                        </tr>
                        {open && hasPdvs ?
                          row.pdvs.map((p) => (
                            <tr
                              key={`${row.id}-${p.id}`}
                              className="border-b border-zinc-50 bg-amber-50/30 dark:border-zinc-800 dark:bg-amber-950/10"
                            >
                              <td />
                              <td className="px-3 py-1.5 pl-8 text-xs text-zinc-700 dark:text-zinc-300">
                                📻 {p.nome}
                              </td>
                              <td className="px-3 py-1.5 text-xs">{formatDoc(p.documento)}</td>
                              <td colSpan={3} />
                              <td className="px-3 py-1.5 text-xs">
                                {formatRioPrimeiroPing(p.primeiroPingEm)}
                              </td>
                            </tr>
                          ))
                        : null}
                      </Fragment>
                    );
                  })
                }
              </tbody>
            </table>
          </div>
        </div>
      : <div className="overflow-hidden rounded-xl border border-violet-200 bg-white dark:border-violet-900/50 dark:bg-zinc-900">
          <div className="border-b border-violet-100 bg-violet-50/80 px-4 py-2 dark:border-violet-900/40 dark:bg-violet-950/20">
            <p className="text-xs font-bold uppercase tracking-wide text-violet-900 dark:text-violet-200">
              Produção musical
            </p>
            <p className="text-xs text-violet-800/80 dark:text-violet-300/80">
              {producao.length} grupo(s) · clique no PDV para editar cadastro
            </p>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {producao.length === 0 ?
              <p className="px-4 py-8 text-center text-sm text-zinc-500">Nenhum cliente na produção.</p>
            : producao.map((c) => {
                const open = openClientes.has(c.key);
                return (
                  <div key={c.key}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                      onClick={() => toggleCliente(c.key)}
                    >
                      <span className="text-zinc-400">{open ? "▾" : "▸"}</span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{c.nome}</span>
                      <span className="text-xs text-zinc-500">
                        {c.pdvCount} PDV(s)
                        {c.documento ? ` · ${c.documento}` : ""}
                      </span>
                    </button>
                    {open ?
                      <div className="space-y-1 border-t border-zinc-100 px-4 py-2 dark:border-zinc-800">
                        {c.pdvs.map((p) => (
                          <button
                            key={p.rioPdvKey}
                            type="button"
                            className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm hover:border-violet-300 hover:bg-violet-50/50 dark:border-zinc-700 dark:hover:border-violet-700 dark:hover:bg-violet-950/20"
                            onClick={() => setCadastroPdvKey(p.rioPdvKey)}
                          >
                            <span>📻</span>
                            <span className="flex-1 font-medium">{p.nome}</span>
                            {p.portalPdvLabel ?
                              <span className="text-xs text-violet-700 dark:text-violet-300">
                                Player {p.portalPdvLabel}
                              </span>
                            : <span className="text-xs text-amber-700 dark:text-amber-400">Sem ID Player</span>}
                            {p.isLinhaProxy ?
                              <span className="text-[10px] text-amber-600">cliente = PDV</span>
                            : null}
                            <span className="text-xs text-violet-600 dark:text-violet-400">Editar cadastro →</span>
                          </button>
                        ))}
                      </div>
                    : null}
                  </div>
                );
              })
            }
          </div>
        </div>
      }

      <PdvCadastroDrawer
        rioPdvKey={cadastroPdvKey}
        editMode
        onClose={() => setCadastroPdvKey(null)}
        onSaved={() => void load()}
      />
    </div>
  );
}

function formatDoc(raw: string | null | undefined): string {
  const t = raw?.trim();
  return t || "—";
}
