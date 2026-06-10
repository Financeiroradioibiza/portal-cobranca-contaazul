"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { displayBrazilianTaxId } from "@/lib/format";
import {
  currentBrazilYearMonth,
  formatYearMonthLabel,
} from "@/lib/manualReminders/yearMonth";
import { painelPdvEditUrl } from "@/lib/radioPainel/publicUrls";

type MonthMeta = { id: string; yearMonth: number };

type VinculoRow = {
  rioPdvId: string;
  rioPdvNome: string;
  rioDocumento: string | null;
  rioPdvMovimento: string;
  clienteLinhaId: string;
  clienteNome: string;
  marcaNome: string | null;
  link: {
    id: string;
    painelPdvId: number;
    painelClienteId: number;
    matchMethod: string;
    painelPdvNome: string | null;
    painelClienteNome: string | null;
    verifiedAt: string | null;
  } | null;
};

type Suggestion = {
  painelPdvId: number;
  painelClienteId: number;
  painelPdvNome: string;
  painelClienteNome: string;
  matchMethod: string;
  score: number;
  label: string;
};

type FilterMode = "todos" | "sem" | "com";

const BULK_BATCH = 10;
const BULK_MIN_SCORE = 55;

type BulkReviewRow = {
  rioPdvId: string;
  included: boolean;
  clienteNome: string;
  marcaNome: string | null;
  rioPdvNome: string;
  rioDocumento: string | null;
  score: number;
  matchMethod: string;
  painelPdvId: string;
  painelClienteId: string;
  painelPdvNome: string;
  painelClienteNome: string;
  label: string;
  alternatives: Suggestion[];
};

type BulkPhase = "idle" | "loading" | "review" | "linking" | "done";

function chunkIds<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function bulkRowFromSuggest(item: {
  rioPdvId: string;
  rioPdvNome: string;
  rioDocumento: string | null;
  clienteNome: string;
  marcaNome: string | null;
  suggestion: Suggestion;
  alternatives: Suggestion[];
}): BulkReviewRow {
  const s = item.suggestion;
  return {
    rioPdvId: item.rioPdvId,
    included: true,
    clienteNome: item.clienteNome,
    marcaNome: item.marcaNome,
    rioPdvNome: item.rioPdvNome,
    rioDocumento: item.rioDocumento,
    score: s.score,
    matchMethod: s.matchMethod,
    painelPdvId: String(s.painelPdvId),
    painelClienteId: String(s.painelClienteId),
    painelPdvNome: s.painelPdvNome,
    painelClienteNome: s.painelClienteNome,
    label: s.label,
    alternatives: item.alternatives,
  };
}

export function CadastrosVinculosPanel() {
  const todayYm = useMemo(() => currentBrazilYearMonth(), []);
  const [months, setMonths] = useState<MonthMeta[]>([]);
  const [activeYm, setActiveYm] = useState(todayYm);
  const [rows, setRows] = useState<VinculoRow[]>([]);
  const [stats, setStats] = useState({ total: 0, linked: 0, unlinked: 0 });
  const [filter, setFilter] = useState<FilterMode>("sem");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [suggestFor, setSuggestFor] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [manualOpen, setManualOpen] = useState<string | null>(null);
  const [manualPdvId, setManualPdvId] = useState("");
  const [manualClienteId, setManualClienteId] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPhase, setBulkPhase] = useState<BulkPhase>("idle");
  const [bulkRows, setBulkRows] = useState<BulkReviewRow[]>([]);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [topSuggestions, setTopSuggestions] = useState<Record<string, Suggestion>>({});
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsProgress, setSuggestionsProgress] = useState({ done: 0, total: 0 });

  const loadTopSuggestions = useCallback(async (vinculoRows: VinculoRow[], ym: number) => {
    const unlinked = vinculoRows.filter((r) => !r.link).map((r) => r.rioPdvId);
    if (unlinked.length === 0) {
      setTopSuggestions({});
      setSuggestionsLoading(false);
      setSuggestionsProgress({ done: 0, total: 0 });
      return;
    }

    setSuggestionsLoading(true);
    setTopSuggestions({});
    setSuggestionsProgress({ done: 0, total: unlinked.length });

    const map: Record<string, Suggestion> = {};
    const batches = chunkIds(unlinked, BULK_BATCH);

    try {
      for (let i = 0; i < batches.length; i++) {
        const res = await fetch(`/api/cadastros/month/${ym}/vinculos/suggest-bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rioPdvIds: batches[i], minScore: 0 }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          items?: Array<{ rioPdvId: string; suggestion: Suggestion }>;
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "suggest_bulk_erro");

        for (const item of data.items ?? []) {
          map[item.rioPdvId] = item.suggestion;
        }

        setTopSuggestions({ ...map });
        setSuggestionsProgress({
          done: Math.min((i + 1) * BULK_BATCH, unlinked.length),
          total: unlinked.length,
        });
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao carregar sugestões.");
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const loadMonths = useCallback(async () => {
    const res = await fetch("/api/rio-planilha/clientes/months");
    const data = (await res.json()) as { months?: MonthMeta[]; error?: string };
    if (!res.ok) throw new Error(data.error ?? "months_erro");
    const list = data.months ?? [];
    setMonths(list);
    setActiveYm((cur) => {
      if (list.some((m) => m.yearMonth === cur)) return cur;
      const pick = list.find((m) => m.yearMonth === todayYm) ?? list[0];
      return pick?.yearMonth ?? cur;
    });
  }, [todayYm]);

  const loadVinculos = useCallback(
    async (ym: number) => {
      setBusy(true);
      setMsg("");
      try {
        const res = await fetch(`/api/cadastros/month/${ym}/vinculos`);
        const data = (await res.json()) as {
          ok?: boolean;
          rows?: VinculoRow[];
          stats?: typeof stats;
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "vinculos_erro");
        const loaded = data.rows ?? [];
        setRows(loaded);
        setStats(data.stats ?? { total: 0, linked: 0, unlinked: 0 });
        void loadTopSuggestions(loaded, ym);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Erro ao carregar vínculos.");
        setRows([]);
        setStats({ total: 0, linked: 0, unlinked: 0 });
        setTopSuggestions({});
      } finally {
        setBusy(false);
      }
    },
    [loadTopSuggestions],
  );

  useEffect(() => {
    void loadMonths().catch((e) => setMsg(e instanceof Error ? e.message : "Erro"));
  }, [loadMonths]);

  useEffect(() => {
    void loadVinculos(activeYm);
  }, [activeYm, loadVinculos]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "sem" && r.link) return false;
      if (filter === "com" && !r.link) return false;
      if (!needle) return true;
      const blob = [
        r.clienteNome,
        r.marcaNome ?? "",
        r.rioPdvNome,
        r.rioDocumento ?? "",
        r.link?.painelPdvNome ?? "",
        r.link ? String(r.link.painelPdvId) : "",
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [rows, filter, q]);

  async function runSuggest(rioPdvId: string) {
    setSuggestFor(rioPdvId);
    setSuggestions([]);
    setMsg("");
    try {
      const res = await fetch("/api/cadastros/pdv-link/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rioCompPdvId: rioPdvId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        suggestions?: Suggestion[];
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "suggest_erro");
      setSuggestions(data.suggestions ?? []);
      if (!(data.suggestions?.length ?? 0)) {
        setMsg("Nenhuma sugestão no export CSV — tente vínculo manual ou atualize data/export-clientes.csv.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro nas sugestões.");
    }
  }

  async function saveLink(
    rioPdvId: string,
    painelPdvId: number,
    painelClienteId: number,
    matchMethod: string,
  ) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/cadastros/pdv-link", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rioCompPdvId: rioPdvId,
          painelPdvId,
          painelClienteId,
          matchMethod,
          verified: true,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        cadastroImport?: { imported?: boolean; source?: string; fields?: string[] };
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "save_erro");
      setSuggestFor(null);
      setManualOpen(null);
      await loadVinculos(activeYm);
      if (data.cadastroImport?.imported) {
        const n = data.cadastroImport.fields?.length ?? 0;
        setMsg(`Vínculo salvo. Cadastro importado do painel (${n} campos).`);
      } else {
        setMsg("Vínculo salvo. Cadastro do painel não disponível — verifique o export CSV.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  function closeBulkPanel() {
    setBulkOpen(false);
    setBulkPhase("idle");
    setBulkRows([]);
    setBulkProgress({ done: 0, total: 0 });
  }

  function patchBulkRow(rioPdvId: string, patch: Partial<BulkReviewRow>) {
    setBulkRows((prev) =>
      prev.map((r) => (r.rioPdvId === rioPdvId ? { ...r, ...patch } : r)),
    );
  }

  function applyBulkAlternative(rioPdvId: string, alt: Suggestion) {
    patchBulkRow(rioPdvId, {
      score: alt.score,
      matchMethod: alt.matchMethod,
      painelPdvId: String(alt.painelPdvId),
      painelClienteId: String(alt.painelClienteId),
      painelPdvNome: alt.painelPdvNome,
      painelClienteNome: alt.painelClienteNome,
      label: alt.label,
    });
  }

  async function startBulkVincular() {
    const unlinked = rows.filter((r) => !r.link).map((r) => r.rioPdvId);
    if (unlinked.length === 0) {
      setMsg("Nenhum PDV sem vínculo nesta competência.");
      return;
    }

    setBulkOpen(true);
    setBulkPhase("loading");
    setBulkRows([]);
    setBulkProgress({ done: 0, total: unlinked.length });
    setMsg("");

    const collected: BulkReviewRow[] = [];
    const batches = chunkIds(unlinked, BULK_BATCH);

    try {
      for (let i = 0; i < batches.length; i++) {
        const res = await fetch(
          `/api/cadastros/month/${activeYm}/vinculos/suggest-bulk`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rioPdvIds: batches[i], minScore: BULK_MIN_SCORE }),
          },
        );
        const data = (await res.json()) as {
          ok?: boolean;
          items?: Array<{
            rioPdvId: string;
            rioPdvNome: string;
            rioDocumento: string | null;
            clienteNome: string;
            marcaNome: string | null;
            suggestion: Suggestion;
            alternatives: Suggestion[];
          }>;
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "suggest_bulk_erro");

        for (const item of data.items ?? []) {
          collected.push(bulkRowFromSuggest(item));
        }

        setBulkRows([...collected]);
        setBulkProgress({
          done: Math.min((i + 1) * BULK_BATCH, unlinked.length),
          total: unlinked.length,
        });
      }

      setBulkPhase("review");
      if (collected.length === 0) {
        setMsg(
          `Nenhuma sugestão com ≥${BULK_MIN_SCORE}% entre ${unlinked.length} PDV(s) sem vínculo.`,
        );
      } else {
        setMsg(
          `${collected.length} sugestão(ões) com ≥${BULK_MIN_SCORE}% — revise e confirme abaixo.`,
        );
      }
    } catch (e) {
      setBulkPhase("idle");
      setMsg(e instanceof Error ? e.message : "Erro ao carregar sugestões em lote.");
    }
  }

  async function applyBulkVincular() {
    const selected = bulkRows.filter(
      (r) =>
        r.included
        && /^\d+$/.test(r.painelPdvId.trim())
        && /^\d+$/.test(r.painelClienteId.trim()),
    );
    if (selected.length === 0) {
      setMsg("Marque ao menos um vínculo válido para aplicar.");
      return;
    }

    setBulkPhase("linking");
    setBulkProgress({ done: 0, total: selected.length });
    setMsg("");

    let totalLinked = 0;
    let totalCadastro = 0;
    const allFailed: Array<{ rioCompPdvId: string; error: string }> = [];
    const batches = chunkIds(selected, BULK_BATCH);

    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]!;
        const res = await fetch("/api/cadastros/pdv-link/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            links: batch.map((r) => ({
              rioCompPdvId: r.rioPdvId,
              painelPdvId: Number(r.painelPdvId),
              painelClienteId: Number(r.painelClienteId),
              matchMethod: r.matchMethod,
            })),
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          linked?: number;
          cadastroImported?: number;
          failed?: Array<{ rioCompPdvId: string; error: string }>;
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "bulk_link_erro");

        totalLinked += data.linked ?? 0;
        totalCadastro += data.cadastroImported ?? 0;
        if (data.failed?.length) allFailed.push(...data.failed);

        setBulkProgress({
          done: Math.min((i + 1) * BULK_BATCH, selected.length),
          total: selected.length,
        });
      }

      setBulkPhase("done");
      await loadVinculos(activeYm);

      const failNote =
        allFailed.length > 0 ? ` ${allFailed.length} falha(s).` : "";
      setMsg(
        `Vínculo em lote: ${totalLinked} salvo(s), ${totalCadastro} cadastro(s) importado(s).${failNote}`,
      );
    } catch (e) {
      setBulkPhase("review");
      setMsg(e instanceof Error ? e.message : "Erro ao vincular em lote.");
    }
  }

  const bulkSelectedCount = bulkRows.filter((r) => r.included).length;

  async function removeLink(rioPdvId: string) {
    if (!window.confirm("Remover vínculo deste PDV com o painel legado?")) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/cadastros/pdv-link/${rioPdvId}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "delete_erro");
      await loadVinculos(activeYm);
      setMsg("Vínculo removido.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao remover.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-4">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Vínculos PDV — Rio × painel legado
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          Cruza PDVs da Planilha Rio com o painel de produção (export CSV). Ao vincular, importa o
          cadastro do painel (endereço, contato da loja, player). Contato cobrança continua vindo da
          Conta Azul / planilha Rio. Não altera o painel legado nem os players.
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Competência</span>
          <select
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
            value={activeYm}
            onChange={(e) => setActiveYm(Number(e.target.value))}
            disabled={busy}
          >
            {months.length === 0 ?
              <option value={activeYm}>{formatYearMonthLabel(activeYm)}</option>
            : months.map((m) => (
                <option key={m.id} value={m.yearMonth}>
                  {formatYearMonthLabel(m.yearMonth)}
                </option>
              ))
            }
          </select>
        </label>

        <select
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterMode)}
        >
          <option value="sem">Sem vínculo ({stats.unlinked})</option>
          <option value="com">Com vínculo ({stats.linked})</option>
          <option value="todos">Todos ({stats.total})</option>
        </select>

        <input
          type="search"
          placeholder="Buscar cliente, PDV, CNPJ…"
          className="min-w-[200px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <button
          type="button"
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
          disabled={busy}
          onClick={() => void loadVinculos(activeYm)}
        >
          Atualizar
        </button>

        <button
          type="button"
          className="rounded-md bg-violet-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          disabled={busy || bulkPhase === "loading" || bulkPhase === "linking"}
          onClick={() => void startBulkVincular()}
        >
          Vincular clientes
        </button>
      </div>

      {bulkOpen ?
        <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50/80 p-4 dark:border-violet-900 dark:bg-violet-950/30">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-violet-900 dark:text-violet-100">
                Vincular clientes — revisão em lote
              </h2>
              <p className="text-xs text-violet-800/90 dark:text-violet-200/80">
                Sugestões com ≥{BULK_MIN_SCORE}% de similaridade. Processa de {BULK_BATCH} em{" "}
                {BULK_BATCH}. Ajuste IDs errados antes de confirmar.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {bulkPhase !== "loading" && bulkRows.length > 0 ?
                <>
                  <button
                    type="button"
                    className="rounded border border-violet-300 px-2 py-1 text-xs font-semibold text-violet-900 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-100"
                    disabled={bulkPhase === "linking" || bulkPhase === "done"}
                    onClick={() =>
                      setBulkRows((prev) => prev.map((r) => ({ ...r, included: true })))
                    }
                  >
                    Marcar todos
                  </button>
                  <button
                    type="button"
                    className="rounded border border-violet-300 px-2 py-1 text-xs font-semibold text-violet-900 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-100"
                    disabled={bulkPhase === "linking" || bulkPhase === "done"}
                    onClick={() =>
                      setBulkRows((prev) => prev.map((r) => ({ ...r, included: false })))
                    }
                  >
                    Desmarcar todos
                  </button>
                  <button
                    type="button"
                    className="rounded bg-emerald-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    disabled={
                      bulkSelectedCount === 0 || bulkPhase === "linking" || bulkPhase === "done"
                    }
                    onClick={() => void applyBulkVincular()}
                  >
                    Vincular selecionados ({bulkSelectedCount})
                  </button>
                </>
              : null}
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-white dark:border-slate-600"
                disabled={bulkPhase === "loading" || bulkPhase === "linking"}
                onClick={closeBulkPanel}
              >
                Fechar
              </button>
            </div>
          </div>

          {bulkPhase === "loading" || bulkPhase === "linking" ?
            <p className="mb-2 text-xs text-violet-800 dark:text-violet-200">
              {bulkPhase === "loading" ? "Carregando sugestões" : "Vinculando"}…{" "}
              {bulkProgress.done}/{bulkProgress.total}
            </p>
          : null}

          {bulkRows.length === 0 && bulkPhase !== "loading" ?
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Nenhuma sugestão forte o suficiente para exibir.
            </p>
          : null}

          {bulkRows.length > 0 ?
            <div className="max-h-[min(52vh,520px)] overflow-auto rounded border border-violet-200 bg-white dark:border-violet-900 dark:bg-slate-900">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 border-b border-violet-100 bg-violet-50 text-[10px] uppercase tracking-wide text-violet-700 dark:border-violet-900 dark:bg-violet-950/80 dark:text-violet-300">
                  <tr>
                    <th className="px-2 py-2 w-8" />
                    <th className="px-2 py-2">Cliente Rio</th>
                    <th className="px-2 py-2">PDV Rio</th>
                    <th className="px-2 py-2">Sugestão painel</th>
                    <th className="px-2 py-2">PdvId</th>
                    <th className="px-2 py-2">ClienteId</th>
                    <th className="px-2 py-2">Outras</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((r) => (
                    <tr
                      key={r.rioPdvId}
                      className="border-b border-slate-100 align-top dark:border-slate-800"
                    >
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={r.included}
                          disabled={bulkPhase === "linking" || bulkPhase === "done"}
                          onChange={(e) =>
                            patchBulkRow(r.rioPdvId, { included: e.target.checked })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium">{r.clienteNome}</div>
                        {r.marcaNome ?
                          <div className="text-violet-700 dark:text-violet-300">{r.marcaNome}</div>
                        : null}
                      </td>
                      <td className="px-2 py-2">
                        <div>{r.rioPdvNome}</div>
                        <div className="text-slate-500">{displayBrazilianTaxId(r.rioDocumento)}</div>
                      </td>
                      <td className="px-2 py-2">
                        <div>
                          <span className="font-bold text-emerald-700 dark:text-emerald-400">
                            {r.score}%
                          </span>{" "}
                          · {r.painelPdvNome}
                        </div>
                        <div className="text-slate-500">
                          {r.painelClienteNome} · {r.matchMethod}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="w-20 rounded border px-1.5 py-1 dark:border-slate-600 dark:bg-slate-950"
                          value={r.painelPdvId}
                          disabled={bulkPhase === "linking" || bulkPhase === "done"}
                          onChange={(e) =>
                            patchBulkRow(r.rioPdvId, {
                              painelPdvId: e.target.value,
                              matchMethod: "manual",
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="w-20 rounded border px-1.5 py-1 dark:border-slate-600 dark:bg-slate-950"
                          value={r.painelClienteId}
                          disabled={bulkPhase === "linking" || bulkPhase === "done"}
                          onChange={(e) =>
                            patchBulkRow(r.rioPdvId, {
                              painelClienteId: e.target.value,
                              matchMethod: "manual",
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        {r.alternatives.length > 0 ?
                          <select
                            className="max-w-[180px] rounded border px-1 py-1 dark:border-slate-600 dark:bg-slate-950"
                            defaultValue=""
                            disabled={bulkPhase === "linking" || bulkPhase === "done"}
                            onChange={(e) => {
                              const idx = Number(e.target.value);
                              const alt = r.alternatives[idx];
                              if (alt) applyBulkAlternative(r.rioPdvId, alt);
                              e.target.value = "";
                            }}
                          >
                            <option value="">Trocar…</option>
                            {r.alternatives.map((alt, idx) => (
                              <option key={`${alt.painelPdvId}-${idx}`} value={idx}>
                                {alt.score}% · #{alt.painelPdvId}
                              </option>
                            ))}
                          </select>
                        : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          : null}
        </div>
      : null}

      {suggestionsLoading ?
        <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
          Carregando sugestões… {suggestionsProgress.done}/{suggestionsProgress.total}
        </p>
      : null}

      {msg ?
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          {msg}
        </p>
      : null}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/80">
            <tr>
              <th className="px-3 py-2">Cliente Rio</th>
              <th className="px-3 py-2">PDV Rio</th>
              <th className="px-3 py-2">CNPJ</th>
              <th className="px-3 py-2">Sugestão painel</th>
              <th className="px-3 py-2">Painel legado</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ?
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  {busy ? "Carregando…" : "Nenhum PDV neste filtro."}
                </td>
              </tr>
            : filtered.map((r) => (
                <tr
                  key={r.rioPdvId}
                  className="border-b border-slate-100 align-top dark:border-slate-800"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {r.clienteNome || "—"}
                    </div>
                    {r.marcaNome ?
                      <div className="text-xs text-violet-700 dark:text-violet-300">
                        {r.marcaNome}
                      </div>
                    : null}
                  </td>
                  <td className="px-3 py-2">
                    <div>{r.rioPdvNome || "—"}</div>
                    {r.rioPdvMovimento !== "estavel" ?
                      <span className="text-xs text-orange-600">{r.rioPdvMovimento}</span>
                    : null}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {displayBrazilianTaxId(r.rioDocumento)}
                  </td>
                  <td className="px-3 py-2 min-w-[220px]">
                    {r.link ?
                      <span className="text-slate-400">—</span>
                    : suggestionsLoading && !topSuggestions[r.rioPdvId] ?
                      <span className="text-xs text-slate-400">carregando…</span>
                    : topSuggestions[r.rioPdvId] ?
                      <button
                        type="button"
                        className="w-full rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-left text-xs hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50"
                        disabled={busy}
                        title="Clique para vincular esta sugestão"
                        onClick={() => {
                          const s = topSuggestions[r.rioPdvId]!;
                          void saveLink(
                            r.rioPdvId,
                            s.painelPdvId,
                            s.painelClienteId,
                            s.matchMethod,
                          );
                        }}
                      >
                        <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                          {topSuggestions[r.rioPdvId]!.score}%
                        </span>{" "}
                        · {topSuggestions[r.rioPdvId]!.label}
                      </button>
                    : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.link ?
                      <div>
                        <div className="font-medium">
                          {r.link.painelPdvNome ?? `PDV #${r.link.painelPdvId}`}
                        </div>
                        <div className="text-xs text-slate-500">
                          #{r.link.painelPdvId} · cliente {r.link.painelClienteId} ·{" "}
                          {r.link.matchMethod}
                        </div>
                        <a
                          href={painelPdvEditUrl(r.link.painelPdvId, r.link.painelClienteId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-sky-700 hover:underline dark:text-sky-400"
                        >
                          Abrir no painel ↗
                        </a>
                      </div>
                    : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {!r.link ?
                        <>
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                            disabled={busy}
                            onClick={() => void runSuggest(r.rioPdvId)}
                          >
                            Sugerir
                          </button>
                          <button
                            type="button"
                            className="rounded border border-violet-300 px-2 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-200 dark:hover:bg-violet-950"
                            disabled={busy}
                            onClick={() => {
                              setManualOpen(r.rioPdvId);
                              setManualPdvId("");
                              setManualClienteId("");
                              setSuggestFor(null);
                            }}
                          >
                            Manual
                          </button>
                        </>
                      : <>
                          <button
                            type="button"
                            className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300"
                            disabled={busy}
                            onClick={() => void removeLink(r.rioPdvId)}
                          >
                            Desvincular
                          </button>
                        </>
                      }
                    </div>

                    {suggestFor === r.rioPdvId && suggestions.length > 0 ?
                      <ul className="mt-2 space-y-1 text-left">
                        {suggestions.map((s) => (
                          <li key={s.painelPdvId}>
                            <button
                              type="button"
                              className="w-full rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-left text-xs hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50"
                              disabled={busy}
                              onClick={() =>
                                void saveLink(
                                  r.rioPdvId,
                                  s.painelPdvId,
                                  s.painelClienteId,
                                  s.matchMethod,
                                )
                              }
                            >
                              <span className="font-semibold">{s.score}%</span> · {s.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    : null}

                    {manualOpen === r.rioPdvId ?
                      <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-left dark:border-slate-600 dark:bg-slate-800">
                        <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          IDs do painel legado
                        </div>
                        <input
                          placeholder="PdvId"
                          className="mb-1 w-full rounded border px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
                          value={manualPdvId}
                          onChange={(e) => setManualPdvId(e.target.value)}
                        />
                        <input
                          placeholder="ClienteId"
                          className="mb-1 w-full rounded border px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
                          value={manualClienteId}
                          onChange={(e) => setManualClienteId(e.target.value)}
                        />
                        <button
                          type="button"
                          className="rounded bg-violet-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          disabled={busy || !/^\d+$/.test(manualPdvId) || !/^\d+$/.test(manualClienteId)}
                          onClick={() =>
                            void saveLink(
                              r.rioPdvId,
                              Number(manualPdvId),
                              Number(manualClienteId),
                              "manual",
                            )
                          }
                        >
                          Salvar vínculo
                        </button>
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
