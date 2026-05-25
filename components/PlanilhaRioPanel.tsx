"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { COMPANY_NAME } from "@/lib/brand";
import {
  formatYearMonthLabel,
  currentBrazilYearMonth,
} from "@/lib/manualReminders/yearMonth";
import type { RioChargeMode, RioPlanilhaBand, RioPlanilhaRow, RioPlanilhaRowKind } from "@prisma/client";
import {
  rioLinhasParsedFromXlsxArrayBuffer,
  rioParsedToDraftVm,
} from "@/lib/rio/rioPlanilhaXlsxImport";
import { sortRioPlanilhaRows } from "@/lib/rio/sortLinhas";
import { readJsonFromResponse } from "@/lib/safeHttpJson";

type MonthMeta = { id: string; yearMonth: number };

type Vm = RioPlanilhaRow & {
  editorKey: string;
  parentEditorKey: string | null;
};

const BAND_LABEL: Record<RioPlanilhaBand, string> = {
  canceladas: "Canceladas / saindo",
  novos: "PDVs novos do mês",
  ativos: "Clientes ativos",
};

const CHARGE_LABEL: Record<RioChargeMode, string> = {
  herda_grupo: "Matriz grupo (CA)",
  cliente_ca_proprio: "Cliente CA próprio",
};

type PessoaHit = { id: string; nome: string; documento?: string | null };

function hydrate(rows: RioPlanilhaRow[]): Vm[] {
  return sortRioPlanilhaRows(rows).map((r) => ({
    ...r,
    editorKey: r.id,
    parentEditorKey: r.parentId,
  }));
}

/** Linha modelo para um novo UUID (substitui `id`/`monthId` no mount). */
function emptyVmBase(
  kind: RioPlanilhaRowKind,
  band: RioPlanilhaBand,
  sortOrder: number,
  overrides: Partial<Pick<Vm, "parentEditorKey" | "chargeMode">> = {},
): Vm {
  const rk = crypto.randomUUID();
  return {
    id: rk,
    monthId: "",
    band,
    kind,
    tituloSecao: null,
    marca: "",
    numOrdem: null,
    pdvNome: kind === "grupo" ? "" : "",
    cnpjDocumento: null,
    status: "",
    valorTexto: null,
    qtdeTexto: null,
    categoria: "",
    email: null,
    dataInstall: null,
    grupoCobranca: "",
    razao: "",
    dataCancel: null,
    notes: "",
    contaAzulPersonId: null,
    chargeMode: overrides.chargeMode ?? (kind === "pdv" && !overrides.parentEditorKey ? "cliente_ca_proprio" : "herda_grupo"),
    sortOrder,
    createdAt: new Date(),
    updatedAt: new Date(),
    parentId: overrides.parentEditorKey ?? null,
    editorKey: rk,
    parentEditorKey: overrides.parentEditorKey ?? null,
  };
}

export function PlanilhaRioPanel() {
  const nowYm = useMemo(() => currentBrazilYearMonth(), []);
  const [months, setMonths] = useState<MonthMeta[]>([]);
  const [activeYm, setActiveYm] = useState<number>(nowYm);
  const [committed, setCommitted] = useState<Vm[]>([]);
  const [draft, setDraft] = useState<Vm[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importingXlsx, setImportingXlsx] = useState(false);
  const xlsxInputRef = useRef<HTMLInputElement>(null);

  const [linkEk, setLinkEk] = useState<string | null>(null);
  const [buscaCa, setBuscaCa] = useState("");
  const [hitsCa, setHitsCa] = useState<PessoaHit[]>([]);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);

  const monthIdLookup = months.find((m) => m.yearMonth === activeYm)?.id ?? "";

  const loadMonth = useCallback(
    async (ym: number) => {
      setLoading(true);
      setMsg(null);
      try {
        const res = await fetch(`/api/rio-planilha/month/${ym}`, { credentials: "include" });
        const { data, rawText } = await readJsonFromResponse<{
          month?: { yearMonth: number; linhas: RioPlanilhaRow[] };
          error?: string;
        }>(res);
        if (!res.ok || !data?.month?.linhas) {
          setMsg(data?.error || rawText.slice(0, 220) || "Falha ao carregar.");
          setCommitted([]);
          if (!editing) setDraft([]);
        } else {
          const vm = hydrate(data.month.linhas);
          setCommitted(vm);
          if (!editing) setDraft(vm);
        }
        setActiveYm(ym);
      } finally {
        setLoading(false);
      }
    },
    [editing],
  );

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/rio-planilha/months", { credentials: "include" });
      const { data } = await readJsonFromResponse<{ months?: MonthMeta[] }>(res);
      if (data?.months?.length) setMonths(data.months);

      const ym0 = typeof data?.months?.[0]?.yearMonth === "number" ? data.months![0].yearMonth : nowYm;
      setActiveYm(ym0);
      await loadMonth(ym0);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once
  }, []);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    if (!linkEk) {
      setHitsCa([]);
      setLinkNotice(null);
      return;
    }
    const q = buscaCa.trim();
    if (q.length < 2) {
      setHitsCa([]);
      setLinkNotice(null);
      return;
    }
    t = setTimeout(async () => {
      const res = await fetch(`/api/manual-envios/contaazul/pessoas?q=${encodeURIComponent(q.slice(0, 120))}`, {
        credentials: "include",
      });
      const { data } = await readJsonFromResponse<{
        connected?: boolean | null;
        message?: string;
        caError?: string;
        pessoas?: PessoaHit[];
      }>(res);
      setHitsCa(data?.pessoas ?? []);
      if (data?.connected === false && data.message) setLinkNotice(data.message);
      else if (data?.caError) setLinkNotice(`API Conta Azul: ${data.caError}`);
      else if (Array.isArray(data?.pessoas) && data.pessoas.length === 0 && data?.connected === true) {
        setLinkNotice(
          "Nenhum cadastro com esse texto — tente nome, CNPJ só dígitos ou parte da razão social.",
        );
      } else setLinkNotice(null);
    }, 380);
    return () => clearTimeout(t);
  }, [buscaCa, linkEk]);

  const startEdit = useCallback(() => {
    setDraft(hydrate(committed.map(({ editorKey: _ek, parentEditorKey: _pk, ...rest }) => rest)));
    setEditing(true);
    setMsg(null);
  }, [committed]);

  const cancelEdit = useCallback(async () => {
    setEditing(false);
    setDraft(committed);
  }, [committed]);

  const updateRow = (ek: string, patch: Partial<Vm>) => {
    setDraft((prev) => prev.map((r) => (r.editorKey === ek ? { ...r, ...patch } : r)));
  };

  const removeRow = (ek: string) => {
    setDraft((prev) => {
      const dropChildren = new Set(prev.filter((r) => r.parentEditorKey === ek).map((c) => c.editorKey));
      dropChildren.add(ek);
      return prev.filter((r) => !dropChildren.has(r.editorKey));
    });
  };

  const addPdvLinha = (band: RioPlanilhaBand) => {
    setDraft((prev) => {
      const mx = prev.length ? Math.max(...prev.map((p) => p.sortOrder || 0)) + 1 : 20;
      return [
        ...prev,
        {
          ...emptyVmBase("pdv", band, mx, { chargeMode: "cliente_ca_proprio" }),
          monthId: monthIdLookup,
        },
      ];
    });
  };

  const addGrupoLinha = (band: RioPlanilhaBand = "ativos") => {
    setDraft((prev) => {
      const mx = prev.length ? Math.max(...prev.map((p) => p.sortOrder || 0)) + 1 : 20;
      return [...prev, { ...emptyVmBase("grupo", band, mx), monthId: monthIdLookup }];
    });
  };

  const addPdvUnderGrupo = (grupoEk: string) => {
    setDraft((prev) => {
      const parent = prev.find((r) => r.editorKey === grupoEk && r.kind === "grupo");
      if (!parent) return prev;
      const mx = prev.length ? Math.max(...prev.map((p) => p.sortOrder || 0)) + 1 : 20;
      return [
        ...prev,
        {
          ...emptyVmBase("pdv", parent.band, mx, {
            parentEditorKey: grupoEk,
            chargeMode: "herda_grupo",
          }),
          monthId: monthIdLookup,
        },
      ];
    });
  };

  const parseAndApplyXlsx = useCallback(
    async (file: File) => {
      if (!monthIdLookup.trim()) {
        setMsg("Aguarde carregar o mês ou atualize a página.");
        return;
      }
      if (
        !confirm(
          "Substituir todas as linhas da competência visível pelos dados da planilha Excel? " +
            "Linhas já guardadas neste portal (incl. vínculos Conta Azul) serão trocadas no rascunho até você clicar Salvar.",
        )
      )
        return;

      setImportingXlsx(true);
      setMsg(null);
      try {
        const buf = await file.arrayBuffer();
        const parsed = await rioLinhasParsedFromXlsxArrayBuffer(buf, monthIdLookup);
        const stripped = rioParsedToDraftVm(parsed.rows).map(({ editorKey: _e, parentEditorKey: _p, ...r }) => r);
        setDraft(hydrate(stripped));
        setEditing(true);
        const wc = [...parsed.warnings];
        if (parsed.skippedRows > 0)
          wc.push(`${parsed.skippedRows} linha(s) da planilha foram ignoradas (vazias / fora das faixas).`);
        setMsg(
          wc.length
            ? `Importação concluída — ${stripped.filter((x) => x.kind === "pdv").length} PDV(s). Avisos: ${wc.join(" ")}`
            : `Importação concluída — ${stripped.filter((x) => x.kind === "pdv").length} PDV(s). Revise e clique em Salvar.`,
        );
      } catch {
        setMsg("Não foi possível ler o Excel — use .xlsx com aba no formato Rio (Marca … Data cancel).");
      } finally {
        setImportingXlsx(false);
      }
    },
    [monthIdLookup],
  );

  const onXlsxChosen = useCallback(
    async (ev: ChangeEvent<HTMLInputElement>) => {
      const f = ev.target.files?.[0];
      ev.target.value = "";
      if (!f) return;
      if (!f.name.toLowerCase().endsWith(".xlsx")) {
        setMsg("Envie um arquivo .xlsx.");
        return;
      }
      await parseAndApplyXlsx(f);
    },
    [parseAndApplyXlsx],
  );

  const saveDraft = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const rows = draft.map((d) => ({
        clientKey: d.editorKey,
        parentClientKey:
          d.parentEditorKey && draft.some((x) => x.editorKey === d.parentEditorKey) ? d.parentEditorKey : null,
        band: d.band,
        kind: d.kind,
        tituloSecao: d.kind === "secao" ? d.tituloSecao : null,
        marca: d.marca,
        numOrdem: d.numOrdem,
        pdvNome: d.pdvNome,
        cnpjDocumento: d.cnpjDocumento,
        status: d.status,
        valorTexto: d.valorTexto,
        qtdeTexto: d.qtdeTexto,
        categoria: d.categoria,
        email: d.email,
        dataInstall: d.dataInstall,
        grupoCobranca: d.grupoCobranca,
        razao: d.razao,
        dataCancel: d.dataCancel,
        notes: d.notes,
        contaAzulPersonId: d.contaAzulPersonId,
        chargeMode: d.chargeMode,
        sortOrder: d.sortOrder,
      }));

      const res = await fetch(`/api/rio-planilha/month/${activeYm}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows }),
      });
      const { data, rawText } = await readJsonFromResponse<{
        ok?: boolean;
        linhas?: RioPlanilhaRow[];
        error?: string;
      }>(res);
      if (!res.ok || !data?.ok || !data.linhas) {
        setMsg(data?.error || rawText.slice(0, 260) || "Não gravou.");
        return;
      }
      const vm = hydrate(data.linhas);
      setCommitted(vm);
      setDraft(vm);
      setEditing(false);
      setMsg("Planilha salva.");
    } finally {
      setSaving(false);
    }
  };

  const onEnsureNextMonth = async () => {
    setMsg(null);
    const res = await fetch("/api/rio-planilha/months", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ advance: true }),
    });
    const { data } = await readJsonFromResponse<{
      months?: MonthMeta[];
      activeYearMonth?: number;
    }>(res);
    if (res.ok && data?.months && typeof data.activeYearMonth === "number") {
      setMonths(data.months);
      setEditing(false);
      await loadMonth(data.activeYearMonth);
    } else {
      setMsg("Não foi possível criar o próximo mês.");
    }
  };

  const renderRowsSorted = sortRioPlanilhaRows(
    draft.map(({ editorKey, parentEditorKey, ...r }) => r),
  );

  const vmByEk = useMemo(() => new Map(draft.map((x) => [x.editorKey, x])), [draft]);

  return (
    <div className="min-h-[70vh] p-4 sm:p-8">
      {linkEk ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-3" role="presentation">
          <div
            className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-300 bg-white p-4 shadow-lg dark:border-slate-600 dark:bg-slate-950"
            role="dialog"
            aria-labelledby="rio-link-ca-title"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 id="rio-link-ca-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Buscar cliente no Conta Azul
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Consulta e escolha o cadastro no Conta Azul (somente leitura pelo portal). Escreve só neste site.
                </p>
              </div>
              <button
                type="button"
                className="rounded px-2 py-1 text-sm text-[#0066cc] underline dark:text-sky-400"
                onClick={() => {
                  setLinkEk(null);
                  setBuscaCa("");
                }}
              >
                Fechar
              </button>
            </div>
            <input
              autoFocus
              value={buscaCa}
              onChange={(e) => setBuscaCa(e.target.value)}
              placeholder="Nome, razão ou CNPJ..."
              className="mb-2 w-full rounded border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
            {linkNotice ? (
              <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50">
                {linkNotice}
              </div>
            ) : null}
            <div className="max-h-[40vh] space-y-1 overflow-y-auto">
              {hitsCa.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className="w-full rounded border border-slate-200 px-2 py-2 text-left text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                  onClick={() => {
                    updateRow(linkEk, {
                      contaAzulPersonId: h.id,
                      razao: h.nome,
                      cnpjDocumento: h.documento ?? null,
                    });
                    setLinkEk(null);
                    setBuscaCa("");
                  }}
                >
                  <span className="font-medium text-slate-900 dark:text-slate-100">{h.nome}</span>
                  {h.documento ? (
                    <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{h.documento}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[#0066cc] dark:text-sky-400">
            {COMPANY_NAME}
          </p>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Planilha Rio</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            Competência mensal igual à sua planilha Excel: canceladas → PDVs novos → clientes ativos (com grupos
            opcionais). Importe um <strong>.xlsx</strong> Rio (apenas este site persistido no Postgres). O botão{' '}
            <strong>CA</strong>
            só <strong>lê</strong> o Cadastro por API para você amarrar a linha — nada aqui atualiza dados no Conta
            Azul.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <ThemeToggle />
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              href="/"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Voltar ao painel
            </Link>
            <input
              ref={xlsxInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={onXlsxChosen}
            />
            <button
              type="button"
              disabled={loading || importingXlsx || saving || !monthIdLookup}
              onClick={() => void xlsxInputRef.current?.click()}
              className="rounded-lg border border-violet-600 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-950 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-500 dark:bg-violet-950/50 dark:text-violet-50 dark:hover:bg-violet-900/60"
              title="Substitui o rascunho deste mês por linhas do Excel modelo Rio (.xlsx). Nenhum envio ao ERP."
            >
              {importingXlsx ? "Lendo Excel…" : "Importar planilha Excel (.xlsx)"}
            </button>
            {!editing ? (
              <button
                type="button"
                onClick={() => startEdit()}
                className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
              >
                Modo edição
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveDraft()}
                  className="rounded-lg bg-[#0066cc] px-3 py-2 text-sm font-semibold text-white hover:brightness-105 disabled:opacity-60 dark:bg-sky-600"
                >
                  {saving ? "Salvando…" : "Salvar"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void cancelEdit()}
                  className="rounded-lg border border-slate-400 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-500 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {msg ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {msg}
        </div>
      ) : null}

      <section className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Competência:
        </span>
        <select
          value={activeYm}
          disabled={loading || editing}
          onChange={(e) => {
            const ym = Number(e.target.value);
            setActiveYm(ym);
            void loadMonth(ym);
          }}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
        >
          {months.map((m) => (
            <option key={m.yearMonth} value={m.yearMonth}>
              {formatYearMonthLabel(m.yearMonth)}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={loading || editing}
          onClick={() => void onEnsureNextMonth()}
          className="rounded-lg border border-dashed border-slate-400 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-900"
          title="+1 mês na sequência"
        >
          + Próximo mês
        </button>
      </section>

      {editing ? (
        <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-3 text-xs text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
          <span className="font-semibold">Inserir:</span>
          <button type="button" onClick={() => addPdvLinha("canceladas")} className="rounded bg-white px-2 py-1 dark:bg-slate-900">
            + PDV (canceladas)
          </button>
          <button type="button" onClick={() => addPdvLinha("novos")} className="rounded bg-white px-2 py-1 dark:bg-slate-900">
            + PDV (novos)
          </button>
          <button type="button" onClick={() => addGrupoLinha("ativos")} className="rounded bg-white px-2 py-1 dark:bg-slate-900">
            + Grupo cobrança (ativos)
          </button>
          <button type="button" onClick={() => addPdvLinha("ativos")} className="rounded bg-white px-2 py-1 dark:bg-slate-900">
            + PDV (CA direto)
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
        <table className="min-w-[1380px] w-full border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr className="bg-slate-100 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-400">
              <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Marca</th>
              <th className="border-b border-slate-200 px-1 py-2 dark:border-slate-700">#</th>
              <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Pdv</th>
              <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">CNPJ</th>
              <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Status</th>
              <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Valor</th>
              <th className="border-b border-slate-200 px-1 py-2 dark:border-slate-700">Qt.</th>
              <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Cat.</th>
              <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Email</th>
              <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Data inst.</th>
              <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Grupo cobrança</th>
              <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Razão</th>
              <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Data cancel</th>
              <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">CA</th>
              <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Modo</th>
              {editing ? <th className="border-b border-slate-200 px-1 py-2 dark:border-slate-700" /> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={editing ? 16 : 15} className="px-4 py-8 text-center text-slate-500">
                  Carregando…
                </td>
              </tr>
            ) : null}
            {!loading &&
              renderRowsSorted.map((base) => {
                const r = vmByEk.get(base.id);
                if (!r) return null;
                const indent = r.kind === "pdv" && r.parentEditorKey ? "pl-4 border-l border-sky-200" : "";

                if (r.kind === "secao") {
                  return (
                    <tr key={r.editorKey} className="bg-amber-50/90 dark:bg-amber-950/30">
                      <td colSpan={editing ? 16 : 15} className="border-b border-slate-200 px-2 py-2 font-bold text-amber-950 dark:border-slate-800 dark:text-amber-50">
                        {editing ? (
                          <input
                            value={r.tituloSecao ?? ""}
                            onChange={(e) => updateRow(r.editorKey, { tituloSecao: e.target.value })}
                            className="w-full rounded border border-amber-300 bg-white px-2 py-1 text-sm font-bold dark:border-amber-800 dark:bg-slate-900"
                          />
                        ) : (
                          <span>{r.tituloSecao}</span>
                        )}
                        <span className="ml-3 text-xs font-normal text-amber-800 dark:text-amber-200">
                          ({BAND_LABEL[r.band]})
                        </span>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={r.editorKey}
                    className={
                      r.kind === "grupo"
                        ? `bg-slate-50 font-semibold dark:bg-slate-900/60 ${indent}`
                        : `hover:bg-slate-50/80 dark:hover:bg-slate-900/40 ${indent}`
                    }
                  >
                    <td className={`border-b border-slate-200 px-2 py-1.5 dark:border-slate-800 ${indent}`}>
                      {editing ? (
                        <input
                          value={r.marca}
                          onChange={(e) => updateRow(r.editorKey, { marca: e.target.value })}
                          className="w-full min-w-[4rem] rounded border border-slate-200 px-1 dark:border-slate-700 dark:bg-slate-900"
                        />
                      ) : (
                        r.marca
                      )}
                    </td>
                    <td className="border-b border-slate-200 px-1 py-1.5 dark:border-slate-800">
                      {editing ? (
                        <input
                          type="number"
                          value={r.numOrdem ?? ""}
                          onChange={(e) =>
                            updateRow(r.editorKey, {
                              numOrdem: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          className="w-10 rounded border border-slate-200 px-1 dark:border-slate-700 dark:bg-slate-900"
                        />
                      ) : (
                        r.numOrdem ?? ""
                      )}
                    </td>
                    <td className="border-b border-slate-200 px-2 py-1.5 dark:border-slate-800">
                      {editing ? (
                        <input
                          value={r.pdvNome}
                          onChange={(e) => updateRow(r.editorKey, { pdvNome: e.target.value })}
                          className="w-full min-w-[8rem] rounded border border-slate-200 px-1 dark:border-slate-700 dark:bg-slate-900"
                        />
                      ) : (
                        r.pdvNome
                      )}
                    </td>
                    <td className="border-b border-slate-200 px-2 py-1.5 dark:border-slate-800">
                      {editing ? (
                        <input
                          value={r.cnpjDocumento ?? ""}
                          onChange={(e) => updateRow(r.editorKey, { cnpjDocumento: e.target.value || null })}
                          className="w-full min-w-[7rem] rounded border border-slate-200 px-1 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900"
                        />
                      ) : (
                        r.cnpjDocumento
                      )}
                    </td>
                    <td className="border-b border-slate-200 px-2 py-1.5 dark:border-slate-800">
                      {editing ? (
                        <input
                          value={r.status}
                          onChange={(e) => updateRow(r.editorKey, { status: e.target.value })}
                          className="w-full min-w-[5rem] rounded border border-slate-200 px-1 dark:border-slate-700 dark:bg-slate-900"
                        />
                      ) : (
                        r.status
                      )}
                    </td>
                    <td className="border-b border-slate-200 px-2 py-1.5 dark:border-slate-800">
                      {editing ? (
                        <input
                          value={r.valorTexto ?? ""}
                          onChange={(e) => updateRow(r.editorKey, { valorTexto: e.target.value || null })}
                          className="w-full min-w-[4rem] rounded border border-slate-200 px-1 dark:border-slate-700 dark:bg-slate-900"
                        />
                      ) : (
                        r.valorTexto
                      )}
                    </td>
                    <td className="border-b border-slate-200 px-1 py-1.5 dark:border-slate-800">
                      {editing ? (
                        <input
                          value={r.qtdeTexto ?? ""}
                          onChange={(e) => updateRow(r.editorKey, { qtdeTexto: e.target.value || null })}
                          className="w-12 rounded border border-slate-200 px-1 dark:border-slate-700 dark:bg-slate-900"
                        />
                      ) : (
                        r.qtdeTexto
                      )}
                    </td>
                    <td className="border-b border-slate-200 px-2 py-1.5 dark:border-slate-800">
                      {editing ? (
                        <input
                          value={r.categoria}
                          onChange={(e) => updateRow(r.editorKey, { categoria: e.target.value })}
                          className="w-full min-w-[5rem] rounded border border-slate-200 px-1 dark:border-slate-700 dark:bg-slate-900"
                        />
                      ) : (
                        r.categoria
                      )}
                    </td>
                    <td className="border-b border-slate-200 px-2 py-1.5 dark:border-slate-800">
                      {editing ? (
                        <input
                          value={r.email ?? ""}
                          onChange={(e) => updateRow(r.editorKey, { email: e.target.value || null })}
                          className="w-full min-w-[8rem] rounded border border-slate-200 px-1 dark:border-slate-700 dark:bg-slate-900"
                        />
                      ) : (
                        r.email
                      )}
                    </td>
                    <td className="border-b border-slate-200 px-2 py-1.5 dark:border-slate-800">
                      {editing ? (
                        <input
                          value={r.dataInstall ?? ""}
                          onChange={(e) => updateRow(r.editorKey, { dataInstall: e.target.value || null })}
                          className="w-full min-w-[6rem] rounded border border-slate-200 px-1 dark:border-slate-700 dark:bg-slate-900"
                        />
                      ) : (
                        r.dataInstall
                      )}
                    </td>
                    <td className="border-b border-slate-200 px-2 py-1.5 dark:border-slate-800">
                      {editing ? (
                        <textarea
                          value={r.grupoCobranca}
                          onChange={(e) => updateRow(r.editorKey, { grupoCobranca: e.target.value })}
                          rows={2}
                          className="w-full min-w-[10rem] rounded border border-slate-200 px-1 text-[11px] dark:border-slate-700 dark:bg-slate-900"
                        />
                      ) : (
                        r.grupoCobranca
                      )}
                    </td>
                    <td className="border-b border-slate-200 px-2 py-1.5 dark:border-slate-800">
                      {editing ? (
                        <textarea
                          value={r.razao}
                          onChange={(e) => updateRow(r.editorKey, { razao: e.target.value })}
                          rows={2}
                          className="w-full min-w-[10rem] rounded border border-slate-200 px-1 text-[11px] dark:border-slate-700 dark:bg-slate-900"
                        />
                      ) : (
                        r.razao
                      )}
                    </td>
                    <td className="border-b border-slate-200 px-2 py-1.5 dark:border-slate-800">
                      {editing ? (
                        <input
                          value={r.dataCancel ?? ""}
                          onChange={(e) => updateRow(r.editorKey, { dataCancel: e.target.value || null })}
                          className="w-full min-w-[5rem] rounded border border-slate-200 px-1 dark:border-slate-700 dark:bg-slate-900"
                        />
                      ) : (
                        r.dataCancel
                      )}
                    </td>
                    <td className="whitespace-nowrap border-b border-slate-200 px-2 py-1.5 dark:border-slate-800">
                      {r.contaAzulPersonId ? (
                        <span title={r.contaAzulPersonId} className="font-mono text-[10px] text-emerald-800 dark:text-emerald-400">
                          {r.contaAzulPersonId.slice(0, 8)}…
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      {editing && (r.kind === "grupo" || r.kind === "pdv") ? (
                        <button
                          type="button"
                          className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-900 dark:bg-sky-900 dark:text-sky-100"
                          onClick={() => {
                            setLinkEk(r.editorKey);
                            setBuscaCa("");
                          }}
                        >
                          CA
                        </button>
                      ) : null}
                      {editing && r.kind === "grupo" ? (
                        <button
                          type="button"
                          title="Novo PDV sob este grupo"
                          className="ml-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-900 dark:bg-violet-900 dark:text-violet-100"
                          onClick={() => addPdvUnderGrupo(r.editorKey)}
                        >
                          +PDV
                        </button>
                      ) : null}
                    </td>
                    <td className="border-b border-slate-200 px-2 py-1.5 dark:border-slate-800">
                      {r.kind !== "pdv" ? (
                        "—"
                      ) : editing ? (
                        <select
                          value={r.chargeMode}
                          onChange={(e) => updateRow(r.editorKey, { chargeMode: e.target.value as RioChargeMode })}
                          className="max-w-[8rem] rounded border border-slate-200 px-1 text-[10px] dark:border-slate-700 dark:bg-slate-900"
                        >
                          <option value="herda_grupo">{CHARGE_LABEL.herda_grupo}</option>
                          <option value="cliente_ca_proprio">{CHARGE_LABEL.cliente_ca_proprio}</option>
                        </select>
                      ) : (
                        CHARGE_LABEL[r.chargeMode]
                      )}
                    </td>
                    {editing ? (
                      <td className="border-b border-slate-200 px-1 py-1.5 align-top dark:border-slate-800">
                        <button
                          type="button"
                          className="rounded border border-rose-200 px-1.5 py-0.5 text-[10px] text-rose-800 dark:border-rose-900 dark:text-rose-200"
                          onClick={() => removeRow(r.editorKey)}
                        >
                          ✕
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 max-w-3xl text-[11px] text-slate-500 dark:text-slate-400">
        Padrão de início da competência: <strong>Mai/2026</strong> (<code>RIO_PLANILHA_START_YM</code>=
        <code>202605</code>). Para colunas <strong>CNPJ</strong>, formate-as como <strong>texto</strong> antes de
        exportar (.xlsx) para evitar notação científica. Conta Azul: uso só para buscar cadastro pelo botão da coluna{' '}
        <strong>CA</strong>; os dados ficam apenas neste portal até você gravar (<strong>Salvar</strong>).
      </p>
    </div>
  );
}
