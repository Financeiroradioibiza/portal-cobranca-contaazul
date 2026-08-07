"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FinanceiroDiarioEntryRow, FinanceiroDiarioSortField } from "@/lib/financeiro/financeiroDiarioService";
import type { PlayerAvisoPdvTarget } from "@/lib/suporte/playerAvisoPdvSearch";

type TargetScope = "pdv" | "cliente";

type SelectedPdv = {
  portalClienteId: number;
  portalPdvId: number;
  clienteNome: string;
  pdvNome: string;
  codigoDisplay: string;
};

type SelectedClient = {
  portalClienteId: number;
  clienteNome: string;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/40 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

function formatBrDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function parseRows(data: unknown): FinanceiroDiarioEntryRow[] {
  if (!data || typeof data !== "object" || !("rows" in data)) return [];
  const rows = (data as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows.filter((r): r is FinanceiroDiarioEntryRow => {
    return !!r && typeof r === "object" && typeof (r as FinanceiroDiarioEntryRow).id === "string";
  });
}

function TargetPicker({
  scope,
  selectedPdv,
  selectedClient,
  onSelectPdv,
  onSelectClient,
  disabled,
}: {
  scope: TargetScope;
  selectedPdv: SelectedPdv | null;
  selectedClient: SelectedClient | null;
  onSelectPdv: (target: SelectedPdv | null) => void;
  onSelectClient: (target: SelectedClient | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerAvisoPdvTarget[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = scope === "pdv" ? selectedPdv : selectedClient;

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = window.setTimeout(() => {
      void fetch(`/api/financeiro/diario/target-search?q=${encodeURIComponent(q)}`, {
        credentials: "same-origin",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const targets = (data as { targets?: PlayerAvisoPdvTarget[] })?.targets;
          setResults(Array.isArray(targets) ? targets : []);
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 280);

    return () => window.clearTimeout(timer);
  }, [query]);

  function pick(t: PlayerAvisoPdvTarget) {
    if (scope === "cliente") {
      onSelectClient({
        portalClienteId: t.portalClienteId,
        clienteNome: t.clienteNome,
      });
    } else {
      onSelectPdv({
        portalClienteId: t.portalClienteId,
        portalPdvId: t.portalPdvId,
        clienteNome: t.clienteNome,
        pdvNome: t.pdvNome,
        codigoDisplay: t.codigoDisplay,
      });
    }
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  const displayResults =
    scope === "cliente" ?
      (() => {
        const seen = new Set<number>();
        const out: PlayerAvisoPdvTarget[] = [];
        for (const t of results) {
          if (seen.has(t.portalClienteId)) continue;
          seen.add(t.portalClienteId);
          out.push(t);
        }
        return out;
      })()
    : results;

  return (
    <div ref={wrapRef} className="space-y-2">
      {selected ?
        <div className="flex items-start justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 dark:border-sky-900 dark:bg-sky-950/40">
          <div className="min-w-0 text-sm">
            {scope === "pdv" && selectedPdv ?
              <>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{selectedPdv.clienteNome}</p>
                <p className="text-slate-600 dark:text-slate-300">{selectedPdv.pdvNome}</p>
                <p className="mt-1 font-mono text-[11px] text-slate-500">{selectedPdv.codigoDisplay}</p>
              </>
            : selectedClient ?
              <>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{selectedClient.clienteNome}</p>
                <p className="mt-1 font-mono text-[11px] text-slate-500">
                  Cliente {selectedClient.portalClienteId}
                </p>
              </>
            : null}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (scope === "pdv") onSelectPdv(null);
              else onSelectClient(null);
            }}
            className="shrink-0 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            trocar
          </button>
        </div>
      : <>
          <input
            type="search"
            disabled={disabled}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={scope === "pdv" ? "Buscar PDV (nome ou código 229.001)…" : "Buscar cliente…"}
            className={inputClass}
          />
          {open && query.trim().length >= 2 ?
            <ul className="max-h-52 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {searching ?
                <li className="px-3 py-2 text-sm text-slate-500">Buscando…</li>
              : displayResults.length === 0 ?
                <li className="px-3 py-2 text-sm text-slate-500">Nenhum resultado.</li>
              : displayResults.map((t) => (
                  <li key={`${t.portalClienteId}-${t.portalPdvId}`}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                      onClick={() => pick(t)}
                    >
                      <span className="font-medium text-slate-900 dark:text-slate-100">{t.clienteNome}</span>
                      {scope === "pdv" ?
                        <>
                          <span className="text-slate-500"> · </span>
                          <span className="text-slate-700 dark:text-slate-300">{t.pdvNome}</span>
                          <span className="ml-2 font-mono text-[11px] text-slate-400">{t.codigoDisplay}</span>
                        </>
                      : null}
                    </button>
                  </li>
                ))
              }
            </ul>
          : null}
        </>
      }
    </div>
  );
}

function SortButton({
  label,
  field,
  current,
  order,
  onSort,
}: {
  label: string;
  field: FinanceiroDiarioSortField;
  current: FinanceiroDiarioSortField;
  order: "asc" | "desc";
  onSort: (field: FinanceiroDiarioSortField) => void;
}) {
  const active = current === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={
        "inline-flex items-center gap-1 font-semibold " +
        (active ? "text-sky-700 dark:text-sky-300" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200")
      }
    >
      {label}
      {active ?
        <span className="text-[10px]">{order === "asc" ? "▲" : "▼"}</span>
      : null}
    </button>
  );
}

export function FinanceiroDiarioPanel() {
  const [scope, setScope] = useState<TargetScope>("pdv");
  const [selectedPdv, setSelectedPdv] = useState<SelectedPdv | null>(null);
  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null);
  const [texto, setTexto] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);

  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroPdv, setFiltroPdv] = useState("");
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [sort, setSort] = useState<FinanceiroDiarioSortField>("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const [rows, setRows] = useState<FinanceiroDiarioEntryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<string[]>([]);

  const limit = 50;

  const loadList = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({
        sort,
        order,
        limit: String(limit),
        offset: String(offset),
      });
      if (dataDe.trim()) params.set("dataDe", dataDe.trim());
      if (dataAte.trim()) params.set("dataAte", dataAte.trim());
      if (filtroCliente.trim()) params.set("cliente", filtroCliente.trim());
      if (filtroPdv.trim()) params.set("pdv", filtroPdv.trim());
      if (filtroTexto.trim()) params.set("texto", filtroTexto.trim());
      if (filtroUsuario.trim()) params.set("usuario", filtroUsuario.trim());

      const res = await fetch(`/api/financeiro/diario?${params}`, { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setListError(typeof data.error === "string" ? data.error : "Erro ao carregar diário.");
        setRows([]);
        setTotal(0);
        return;
      }
      setRows(parseRows(data));
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch {
      setListError("Erro de rede ao carregar diário.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [dataDe, dataAte, filtroCliente, filtroPdv, filtroTexto, filtroUsuario, sort, order, offset]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void fetch("/api/financeiro/diario?usuarios=1", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const list = (data as { usuarios?: string[] })?.usuarios;
        if (Array.isArray(list)) setUsuarios(list);
      })
      .catch(() => {});
  }, [rows.length]);

  function handleSort(field: FinanceiroDiarioSortField) {
    if (sort === field) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setOrder(field === "createdAt" ? "desc" : "asc");
    }
    setOffset(0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormOk(null);

    const relato = texto.trim();
    if (!relato) {
      setFormError("Escreva o relato do atendimento.");
      return;
    }

    const target =
      scope === "pdv" ? selectedPdv
      : selectedClient;
    if (!target) {
      setFormError(scope === "pdv" ? "Escolha um PDV." : "Escolha um cliente.");
      return;
    }

    setSaving(true);
    try {
      const body =
        scope === "pdv" && selectedPdv ?
          {
            escopo: "pdv",
            portalClienteId: selectedPdv.portalClienteId,
            portalPdvId: selectedPdv.portalPdvId,
            clienteNome: selectedPdv.clienteNome,
            pdvNome: selectedPdv.pdvNome,
            codigoDisplay: selectedPdv.codigoDisplay,
            texto: relato,
          }
        : selectedClient ?
          {
            escopo: "cliente",
            portalClienteId: selectedClient.portalClienteId,
            clienteNome: selectedClient.clienteNome,
            texto: relato,
          }
        : null;

      if (!body) return;

      const res = await fetch("/api/financeiro/diario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const err = data.error;
        if (err === "texto_vazio") setFormError("Escreva o relato do atendimento.");
        else if (err === "cliente_invalido" || err === "pdv_invalido") setFormError("Cliente ou PDV inválido.");
        else setFormError("Não foi possível salvar.");
        return;
      }

      setTexto("");
      setFormOk("Registro salvo.");
      setOffset(0);
      void loadList();
    } catch {
      setFormError("Erro de rede ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Novo registro</h2>
        <p className="mt-1 text-xs text-slate-500">
          Escolha cliente ou PDV e descreva o que foi feito no atendimento.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["pdv", "cliente"] as const).map((s) => (
              <button
                key={s}
                type="button"
                disabled={saving}
                onClick={() => {
                  setScope(s);
                  setSelectedPdv(null);
                  setSelectedClient(null);
                }}
                className={
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition " +
                  (scope === s ?
                    "border-sky-600 bg-sky-600 text-white"
                  : "border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-300")
                }
              >
                {s === "pdv" ? "PDV" : "Cliente"}
              </button>
            ))}
          </div>

          <TargetPicker
            scope={scope}
            selectedPdv={selectedPdv}
            selectedClient={selectedClient}
            onSelectPdv={setSelectedPdv}
            onSelectClient={setSelectedClient}
            disabled={saving}
          />

          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={saving}
            rows={4}
            placeholder="Relato do atendimento…"
            className={inputClass + " min-h-[5rem] resize-y"}
          />

          {formError ?
            <p className="text-sm text-rose-600 dark:text-rose-400">{formError}</p>
          : null}
          {formOk ?
            <p className="text-sm text-emerald-600 dark:text-emerald-400">{formOk}</p>
          : null}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar registro"}
          </button>
        </form>
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="shrink-0 border-b border-slate-200 p-4 dark:border-slate-700">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Histórico</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">De</span>
              <input type="date" value={dataDe} onChange={(e) => { setDataDe(e.target.value); setOffset(0); }} className={inputClass} />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">Até</span>
              <input type="date" value={dataAte} onChange={(e) => { setDataAte(e.target.value); setOffset(0); }} className={inputClass} />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">Cliente</span>
              <input type="search" value={filtroCliente} onChange={(e) => { setFiltroCliente(e.target.value); setOffset(0); }} placeholder="Nome ou ID" className={inputClass} />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">PDV</span>
              <input type="search" value={filtroPdv} onChange={(e) => { setFiltroPdv(e.target.value); setOffset(0); }} placeholder="Nome ou 229.001" className={inputClass} />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">Usuário</span>
              <input type="search" list="diario-usuarios" value={filtroUsuario} onChange={(e) => { setFiltroUsuario(e.target.value); setOffset(0); }} placeholder="Quem registrou" className={inputClass} />
              <datalist id="diario-usuarios">
                {usuarios.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </label>
            <label className="block text-xs sm:col-span-2 lg:col-span-1 xl:col-span-1">
              <span className="mb-1 block font-semibold text-slate-500">Informação</span>
              <input type="search" value={filtroTexto} onChange={(e) => { setFiltroTexto(e.target.value); setOffset(0); }} placeholder="Buscar no relato" className={inputClass} />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            {total} registro{total === 1 ? "" : "s"}
            {!dataDe && !dataAte ? " · todos os dias" : ""}
            {" · "}ordenar pelas colunas abaixo
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading ?
            <p className="p-4 text-sm text-slate-500">Carregando…</p>
          : listError ?
            <p className="p-4 text-sm text-rose-600">{listError}</p>
          : rows.length === 0 ?
            <p className="p-4 text-sm text-slate-500">Nenhum registro encontrado.</p>
          : <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-950">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
                    <SortButton label="Data" field="createdAt" current={sort} order={order} onSort={handleSort} />
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
                    <SortButton label="Usuário" field="criadoPorNome" current={sort} order={order} onSort={handleSort} />
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
                    <SortButton label="Cliente" field="clienteNome" current={sort} order={order} onSort={handleSort} />
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
                    <SortButton label="PDV" field="pdvNome" current={sort} order={order} onSort={handleSort} />
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
                    <SortButton label="Relato" field="texto" current={sort} order={order} onSort={handleSort} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 align-top dark:border-slate-800">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                      {formatBrDateTime(row.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{row.criadoPorNome || row.criadoPorEmail}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{row.clienteNome}</div>
                      {row.portalClienteId != null ?
                        <div className="font-mono text-[10px] text-slate-400">{row.portalClienteId}</div>
                      : null}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {row.escopo === "cliente" ?
                        <span className="text-slate-400">—</span>
                      : <>
                          <div>{row.pdvNome || "—"}</div>
                          {row.codigoDisplay ?
                            <div className="font-mono text-[10px] text-slate-400">{row.codigoDisplay}</div>
                          : null}
                        </>
                      }
                    </td>
                    <td className="max-w-xl px-3 py-2 text-slate-800 whitespace-pre-wrap break-words dark:text-slate-200">
                      {row.texto}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </div>

        {totalPages > 1 ?
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
            <button
              type="button"
              disabled={offset <= 0 || loading}
              onClick={() => setOffset((o) => Math.max(0, o - limit))}
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-500">
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              disabled={offset + limit >= total || loading}
              onClick={() => setOffset((o) => o + limit)}
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        : null}
      </section>
    </div>
  );
}
