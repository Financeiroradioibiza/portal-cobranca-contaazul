"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { ThemeToggle } from "@/components/ThemeToggle";
import { COMPANY_NAME } from "@/lib/brand";
import {
  currentBrazilYearMonth,
  formatYearMonthLabel,
  shiftYearMonth,
} from "@/lib/manualReminders/yearMonth";
import { readJsonFromResponse } from "@/lib/safeHttpJson";

type MonthMeta = { id: string; yearMonth: number };
type Mov = "estavel" | "entrada" | "saida";

type RioPdv = {
  id: string;
  nome: string;
  notes: string;
  sortOrder: number;
};

type RioLinha = {
  id: string;
  caPersonId: string;
  grupoSite: string;
  nomeFantasia: string;
  razaoSocial: string;
  documento: string | null;
  emailCobranca: string | null;
  valorClienteTexto: string;
  numeroPdvSite: number;
  categoriaSite: string;
  contratosAtivosTexto: string;
  movimento: Mov;
  observacoesLinha: string;
  pdvs: RioPdv[];
};

const CAT_OPTIONS = ["", "moda", "shopping", "hotelaria", "gastronomia", "outro"];

function movBadge(m: Mov) {
  if (m === "entrada") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100">
        Entrada no mês
      </span>
    );
  }
  if (m === "saida") {
    return (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-900 dark:bg-rose-900/55 dark:text-rose-100">
        Saiu no mês
      </span>
    );
  }
  return (
    <span className="text-[10px] text-slate-400 dark:text-slate-500">—</span>
  );
}

function contractsCell(txt: string) {
  const t = txt.trim();
  if (!t || t === "—") {
    return (
      <span className="inline-flex min-w-[4.5rem] justify-center rounded-md bg-orange-500/95 px-2 py-1 text-[11px] font-semibold text-white shadow-sm">
        Sem contrato
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-[4.5rem] justify-center rounded-md bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white shadow-sm">
      {t}
    </span>
  );
}

export function RioClientesCompPanel() {
  const todayYm = useMemo(() => currentBrazilYearMonth(), []);
  const [months, setMonths] = useState<MonthMeta[]>([]);
  const [activeYm, setActiveYm] = useState<number>(todayYm);
  const [monthInfo, setMonthInfo] = useState<{ lastSyncedAt: string | null } | null>(null);
  const [linhas, setLinhas] = useState<RioLinha[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [newPdvName, setNewPdvName] = useState<Record<string, string>>({});
  /** Buscar contrato na CA por cliente deixa o pedido muito longo (timeout no Netlify/proxy). */
  const [syncIncludeContracts, setSyncIncludeContracts] = useState(false);

  const loadMonths = useCallback(async () => {
    const res = await fetch("/api/rio-planilha/clientes/months", { credentials: "include" });
    const { data } = await readJsonFromResponse<{ months?: MonthMeta[] }>(res);
    if (res.ok && data?.months) setMonths(data.months);
  }, []);

  const loadMonth = useCallback(async (ym: number) => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/rio-planilha/clientes/month/${ym}`, {
        credentials: "include",
      });
      const { data, rawText } = await readJsonFromResponse<{
        month?: { lastSyncedAt?: string } | null;
        linhas?: RioLinha[];
      }>(res);
      if (!res.ok) {
        setMsg(data && "error" in data ? String((data as { error: string }).error) : rawText.slice(0, 200));
        setLinhas([]);
        setMonthInfo(null);
        return;
      }
      setMonthInfo(
        data?.month ? { lastSyncedAt: data.month.lastSyncedAt ?? null } : { lastSyncedAt: null },
      );
      setLinhas(Array.isArray(data?.linhas) ? data!.linhas! : []);
    } catch {
      setMsg("Falha ao carregar competência.");
      setLinhas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMonths();
  }, [loadMonths]);

  useEffect(() => {
    void loadMonth(activeYm);
  }, [activeYm, loadMonth]);

  const ensureMonthShell = useCallback(async () => {
    const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}`, {
      method: "PUT",
      credentials: "include",
    });
    if (!res.ok) {
      const { data } = await readJsonFromResponse<{ error?: string }>(res);
      setMsg(data?.error || "Não foi possível criar o mês.");
      return;
    }
    await loadMonths();
    await loadMonth(activeYm);
  }, [activeYm, loadMonth, loadMonths]);

  const syncCa = useCallback(async () => {
    setSyncing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}/sync`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeContracts: syncIncludeContracts }),
      });
      const { data, rawText, parseError } = await readJsonFromResponse<{
        linhas?: RioLinha[];
        error?: string;
        count?: number;
        caPersonListingCount?: number;
        syncedContractsFromCa?: boolean;
      }>(res);
      if (!res.ok) {
        const proxyHtml =
          parseError &&
          (/inactivity\s+timeout/i.test(rawText) ||
            /too much time has passed/i.test(rawText));
        if (proxyHtml) {
          setMsg(
            "O servidor ou a rede cortaram o pedido por tempo (timeout). Na Planilha Rio isso costuma acontecer ao buscar contratos na Conta Azul para muitos clientes: deixe desmarcada a opção «Atualizar números de contrato…» e sincronize de novo; no Netlify um plano mais alto ou timeout maior também ajuda.",
          );
          return;
        }
        const code = data?.error;
        const friendly =
          code === "conta_azul_disconnected" ?
            "Conta Azul desconectada: reconecte o portal (integração OAuth) e tente de novo."
          : ((code ?? rawText.slice(0, 220)) || `Erro ${res.status}`);
        setMsg(friendly);
        return;
      }
      setLinhas(data?.linhas ?? []);
      setMonthInfo((m) => ({ lastSyncedAt: new Date().toISOString() }));
      const n = data?.count ?? data?.linhas?.length ?? 0;
      const listed = data?.caPersonListingCount;
      const listedHint =
        typeof listed === "number" ?
          ` (${listed} registros «Cliente» na listagem CA${listed === 0 ? " — nada retornado pela API neste critério" : ""})`
        : "";
      const contrHint =
        data?.syncedContractsFromCa ?
          " Contratos CA atualizados nesta sync."
        : " Contratos: mantidos do que já estava na competência (sync sem busca em /contratos).";
      setMsg(`Sincronizado: ${n} linhas.${listedHint}${contrHint}`);
      await loadMonths();
    } catch {
      setMsg("Falha na sincronização.");
    } finally {
      setSyncing(false);
    }
  }, [activeYm, syncIncludeContracts]);

  const patchLinha = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const res = await fetch(`/api/rio-planilha/clientes/month/${activeYm}/linha/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const { data } = await readJsonFromResponse<{ linha?: RioLinha }>(res);
      if (!res.ok || !data?.linha) return;
      setLinhas((prev) =>
        prev.map((x) =>
          x.id === id ? { ...data.linha!, pdvs: data.linha!.pdvs ?? x.pdvs } : x,
        ),
      );
    },
    [activeYm],
  );

  const addPdv = useCallback(
    async (linhaId: string) => {
      const nome = (newPdvName[linhaId] ?? "").trim();
      const res = await fetch(
        `/api/rio-planilha/clientes/month/${activeYm}/linha/${linhaId}/pdv`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome }),
        },
      );
      const { data } = await readJsonFromResponse<{ pdv?: RioPdv }>(res);
      if (!res.ok || !data?.pdv) return;
      setNewPdvName((m) => ({ ...m, [linhaId]: "" }));
      setLinhas((prev) =>
        prev.map((x) =>
          x.id === linhaId ? { ...x, pdvs: [...x.pdvs, data.pdv!].sort((a, b) => a.sortOrder - b.sortOrder) } : x,
        ),
      );
    },
    [activeYm, newPdvName],
  );

  const patchPdv = useCallback(async (pdvId: string, nome: string) => {
    const res = await fetch(`/api/rio-planilha/clientes/pdv/${pdvId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    });
    const { data } = await readJsonFromResponse<{ pdv?: RioPdv }>(res);
    if (!res.ok || !data?.pdv) return;
    setLinhas((prev) =>
      prev.map((ln) => ({
        ...ln,
        pdvs: ln.pdvs.map((p) => (p.id === pdvId ? { ...p, nome: data.pdv!.nome } : p)),
      })),
    );
  }, []);

  const delPdv = useCallback(async (pdvId: string) => {
    const res = await fetch(`/api/rio-planilha/clientes/pdv/${pdvId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) return;
    setLinhas((prev) =>
      prev.map((ln) => ({
        ...ln,
        pdvs: ln.pdvs.filter((p) => p.id !== pdvId),
      })),
    );
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const exportExcel = useCallback(() => {
    const head = [
      "Grupo",
      "Cliente",
      "CNPJ",
      "Movimento",
      "Contratos ativos",
      "Valor (CA)",
      "Nº PDVs (site)",
      "Categoria",
      "E-mail cobrança",
      "Razão social",
      "PDVs (lista)",
    ];
    const rows = linhas.map((r) => [
      r.grupoSite,
      r.nomeFantasia,
      r.documento ?? "",
      r.movimento,
      r.contratosAtivosTexto,
      r.valorClienteTexto,
      String(r.numeroPdvSite),
      r.categoriaSite,
      r.emailCobranca ?? "",
      r.razaoSocial,
      r.pdvs.map((p) => p.nome).join(" | "),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rio");
    XLSX.writeFile(wb, `planilha-rio-${activeYm}.xlsx`);
  }, [linhas, activeYm]);

  const createMonth = useCallback(async () => {
    const base = months.length > 0 ? months[0].yearMonth : activeYm;
    const next = shiftYearMonth(base, 1);
    const res = await fetch("/api/rio-planilha/clientes/months", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yearMonth: next }),
    });
    if (!res.ok) {
      const { data } = await readJsonFromResponse<{ error?: string }>(res);
      setMsg(data?.error || "Falha ao criar competência.");
      return;
    }
    await loadMonths();
    setActiveYm(next);
  }, [months, activeYm, loadMonths]);

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-6 sm:px-5">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/"
            className="text-[11px] font-semibold text-sky-600 underline-offset-4 hover:underline dark:text-sky-400"
          >
            ← Painel principal
          </Link>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Planilha Rio — clientes ativos Conta Azul
          </h1>
          <p className="mt-1 max-w-[52rem] text-sm text-slate-600 dark:text-slate-400">
            Mockup inicial: cada competência guarda uma fotografia dos <strong>clientes ativos</strong> vindos da
            Conta Azul. Ao sincronizar, comparamos com o <strong>mês civil anterior</strong> já gravado aqui para
            marcar <em>entrada</em>/<em>saida</em> (somente informação no portal). Grupo, categoria e PDVs você edita
            no site — importação em massa de PDVs será o próximo passo.
          </p>
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-500">
            {monthInfo?.lastSyncedAt ?
              <>Última sincronização: {new Date(monthInfo.lastSyncedAt).toLocaleString("pt-BR")}</>
            : <>Ainda não sincronizado nesta competência.</>}
          </p>
        </div>
        <ThemeToggle />
      </header>

      {msg ?
        <div className="mb-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {msg}
        </div>
      : null}

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex max-w-md cursor-pointer items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={syncIncludeContracts}
            onChange={(e) => setSyncIncludeContracts(e.target.checked)}
          />
          <span>
            Atualizar <strong>números de contrato</strong> na Conta Azul (muito mais lento; pode dar{" "}
            <em>timeout</em> no Netlify com muitos clientes).
          </span>
        </label>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Competência</span>
          <select
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
            value={activeYm}
            onChange={(e) => setActiveYm(Number(e.target.value))}
          >
            {months.length === 0 ?
              <option value={activeYm}>{formatYearMonthLabel(activeYm)}</option>
            : months.map((m) => (
                <option key={m.id} value={m.yearMonth}>
                  {formatYearMonthLabel(m.yearMonth)}
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          onClick={() => void ensureMonthShell()}
        >
          Garantir mês na base
        </button>
        <button
          type="button"
          className="rounded-lg border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
          disabled={syncing}
          onClick={() => void syncCa()}
        >
          {syncing ? "Sincronizando…" : "Sincronizar Conta Azul"}
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          onClick={() => void exportExcel()}
        >
          Exportar Excel
        </button>
        <button
          type="button"
          className="rounded-lg border border-dashed border-slate-400 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-500 dark:text-slate-300"
          onClick={() => void createMonth()}
        >
          Novo mês seguinte (+1)
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <table className="min-w-[1100px] w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <th className="px-2 py-2">Grupo</th>
              <th className="px-2 py-2">Cliente</th>
              <th className="px-2 py-2">CNPJ</th>
              <th className="px-2 py-2">Mov.</th>
              <th className="px-2 py-2">Contrato</th>
              <th className="px-2 py-2">Valor</th>
              <th className="px-2 py-2">Nº PDV</th>
              <th className="px-2 py-2">Categoria</th>
              <th className="px-2 py-2">E-mail cobrança</th>
              <th className="px-2 py-2">Razão social</th>
            </tr>
          </thead>
          <tbody>
            {loading ?
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                  Carregando…
                </td>
              </tr>
            : linhas.length === 0 ?
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                  Nenhuma linha. Crie o mês e use <strong>Sincronizar Conta Azul</strong> (é preciso estar conectado ao
                  ERP).
                </td>
              </tr>
            : linhas.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-b border-slate-100 align-top hover:bg-slate-50/80 dark:border-slate-900 dark:hover:bg-slate-900/40">
                    <td className="px-2 py-2">
                      <input
                        className="w-full min-w-[6rem] rounded border border-slate-200 bg-transparent px-1 py-0.5 text-[13px] dark:border-slate-700"
                        defaultValue={r.grupoSite}
                        onBlur={(e) => void patchLinha(r.id, { grupoSite: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="text-left font-semibold text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
                        onClick={() => toggleExpand(r.id)}
                      >
                        {r.nomeFantasia}
                      </button>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-[12px] text-slate-700 dark:text-slate-300">
                      {r.documento ?? "—"}
                    </td>
                    <td className="px-2 py-2">{movBadge(r.movimento)}</td>
                    <td className="px-2 py-2 text-center">{contractsCell(r.contratosAtivosTexto)}</td>
                    <td className="px-2 py-2 text-[12px] text-slate-700 dark:text-slate-300">
                      {r.valorClienteTexto?.trim() ? r.valorClienteTexto : "—"}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        className="w-16 rounded border border-slate-200 bg-transparent px-1 py-0.5 text-[13px] dark:border-slate-700"
                        defaultValue={r.numeroPdvSite}
                        onBlur={(e) =>
                          void patchLinha(r.id, { numeroPdvSite: Number(e.target.value) || 0 })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="max-w-[8rem] rounded border border-slate-200 bg-transparent px-1 py-0.5 text-[12px] dark:border-slate-700"
                        defaultValue={r.categoriaSite || ""}
                        onChange={(e) => void patchLinha(r.id, { categoriaSite: e.target.value })}
                      >
                        {CAT_OPTIONS.map((c) => (
                          <option key={c || "empty"} value={c}>
                            {c || "— categoria —"}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="max-w-[12rem] truncate px-2 py-2 text-[12px] text-slate-700 dark:text-slate-300">
                      {r.emailCobranca ?? "—"}
                    </td>
                    <td className="max-w-[14rem] truncate px-2 py-2 text-[12px] text-slate-600 dark:text-slate-400">
                      {r.razaoSocial || "—"}
                    </td>
                  </tr>
                  {expanded.has(r.id) ?
                    <tr className="border-b border-slate-100 bg-slate-50/90 dark:border-slate-900 dark:bg-slate-900/30">
                      <td colSpan={10} className="px-4 py-3">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          PDVs do cliente (editável — ainda sem importação em massa)
                        </p>
                        <ul className="mb-2 space-y-1">
                          {r.pdvs.length === 0 ?
                            <li className="text-xs text-slate-500">Nenhum PDV cadastrado.</li>
                          : r.pdvs.map((p) => (
                              <li
                                key={p.id}
                                className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                              >
                                <input
                                  className="min-w-[12rem] flex-1 rounded border border-transparent px-1 py-0.5 hover:border-slate-200 dark:hover:border-slate-700"
                                  defaultValue={p.nome}
                                  onBlur={(e) => void patchPdv(p.id, e.target.value)}
                                />
                                <button
                                  type="button"
                                  className="text-rose-600 hover:underline dark:text-rose-400"
                                  onClick={() => void delPdv(p.id)}
                                >
                                  remover
                                </button>
                              </li>
                            ))}
                        </ul>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            placeholder="Nome do PDV"
                            className="min-w-[12rem] rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
                            value={newPdvName[r.id] ?? ""}
                            onChange={(e) =>
                              setNewPdvName((m) => ({ ...m, [r.id]: e.target.value }))
                            }
                          />
                          <button
                            type="button"
                            className="rounded bg-slate-800 px-2 py-1 text-xs font-semibold text-white dark:bg-slate-200 dark:text-slate-900"
                            onClick={() => void addPdv(r.id)}
                          >
                            Adicionar PDV
                          </button>
                        </div>
                      </td>
                    </tr>
                  : null}
                </Fragment>
              ))
            }
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-center text-[11px] text-slate-500 dark:text-slate-500">
        {COMPANY_NAME} — dados Conta Azul sob credenciais OAuth deste portal.
      </p>
    </div>
  );
}
