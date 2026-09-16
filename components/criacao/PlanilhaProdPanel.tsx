"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PLANILHA_PROD_COLUMNS,
  PLANILHA_PROD_SISTEMA_LABEL,
  type PlanilhaProdMonthDto,
  type PlanilhaProdRowDto,
  type PlanilhaProdSistema,
} from "@/lib/criacao/planilhaProdTypes";
import type { RioTagCobranca } from "@/lib/rio/rioTagCobranca";
import { rioTagCobrancaSuffix } from "@/lib/rio/rioTagCobranca";

type CriadorGroup = {
  key: string;
  nome: string;
  rows: PlanilhaProdRowDto[];
};

/** Ordem de exibição dentro de cada criador: Player 5 → Painel → 2 Sistemas → Cancelado. */
const SISTEMA_SORT_ORDER: Record<PlanilhaProdSistema, number> = {
  player5: 0,
  painel: 1,
  dois_sistemas: 2,
  cancelado: 3,
};

const FILTRO_SISTEMA_OPTIONS: PlanilhaProdSistema[] = ["player5", "painel", "dois_sistemas", "cancelado"];

type PlanilhaProdSortMode = "cliente" | "sistema";

type ClienteOption = { ref: string; nome: string };
type ProgramacaoOption = { id: string; nome: string; clienteRef: string; clienteNome: string };

function rowClienteSortKey(row: PlanilhaProdRowDto): string {
  const linked =
    row.linkedClienteNome && row.linkedProgramacaoNome ?
      `${row.linkedClienteNome} · ${row.linkedProgramacaoNome}`
    : row.linkedClienteNome || row.linkedProgramacaoNome;
  return (linked || row.clienteLabel).trim().toLocaleLowerCase("pt-BR");
}

function comparePlanilhaProdRows(
  a: PlanilhaProdRowDto,
  b: PlanilhaProdRowDto,
  sortMode: PlanilhaProdSortMode,
): number {
  if (sortMode === "sistema") {
    return (
      SISTEMA_SORT_ORDER[a.sistema] - SISTEMA_SORT_ORDER[b.sistema] ||
      a.sortOrder - b.sortOrder ||
      rowClienteSortKey(a).localeCompare(rowClienteSortKey(b), "pt-BR")
    );
  }
  return (
    a.sortOrder - b.sortOrder ||
    rowClienteSortKey(a).localeCompare(rowClienteSortKey(b), "pt-BR")
  );
}

function buildCriadorGroups(rows: PlanilhaProdRowDto[], sortMode: PlanilhaProdSortMode): CriadorGroup[] {
  const map = new Map<string, CriadorGroup>();
  for (const row of rows) {
    const key = row.criativo.trim() || "—";
    let group = map.get(key);
    if (!group) {
      group = { key, nome: key, rows: [] };
      map.set(key, group);
    }
    group.rows.push(row);
  }
  for (const g of map.values()) {
    g.rows.sort((a, b) => comparePlanilhaProdRows(a, b, sortMode));
  }
  return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function sistemaFilterButtonClass(sistema: PlanilhaProdSistema, active: boolean): string {
  const base = "rounded border px-2 py-1 text-[11px] font-bold ";
  if (active) {
    return base + sistemaCellClass(sistema) + " ring-1 ring-slate-400 dark:ring-slate-500";
  }
  return base + "border-slate-200 opacity-85 hover:opacity-100 dark:border-slate-700 " + sistemaCellClass(sistema);
}

function sistemaCellClass(sistema: PlanilhaProdSistema): string {
  switch (sistema) {
    case "painel":
      return "bg-violet-200 text-violet-900 dark:bg-violet-950 dark:text-violet-100";
    case "dois_sistemas":
      return "bg-orange-200 text-orange-900 dark:bg-orange-950 dark:text-orange-100";
    case "player5":
      return "bg-emerald-200 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100";
    case "cancelado":
      return "bg-red-300 text-red-950 dark:bg-red-950 dark:text-red-100";
  }
}

function todayPtBr(): string {
  return new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function fieldFilled(value: string): boolean {
  return value.trim().length > 0;
}

function isRowAtivo(row: PlanilhaProdRowDto): boolean {
  return row.sistema !== "cancelado";
}

function resolveRowVisual(row: PlanilhaProdRowDto): string {
  const rioTag = row.linkedRioTagCobranca;
  if (row.sistema === "cancelado" || rioTag === "cancelado") {
    return "bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-100";
  }
  if (rioTag === "bloqueio_financeiro") {
    return "bg-orange-50 text-orange-950 dark:bg-orange-950/45 dark:text-orange-100";
  }
  return "hover:bg-slate-50/80 dark:hover:bg-slate-800/40";
}

function filledFieldClass(kind: "progress" | "obs-producao", value: string): string {
  if (!fieldFilled(value)) return "";
  if (kind === "obs-producao") {
    return "bg-amber-200/95 text-amber-950 dark:bg-amber-400/25 dark:text-amber-50";
  }
  return "bg-emerald-200/95 text-emerald-950 dark:bg-emerald-900/70 dark:text-emerald-50";
}

function VinculoPicker({
  row,
  onSave,
}: {
  row: PlanilhaProdRowDto;
  onSave: (patch: Partial<PlanilhaProdRowDto>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [clienteQ, setClienteQ] = useState("");
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [programacoes, setProgramacoes] = useState<ProgramacaoOption[]>([]);
  const [selCliente, setSelCliente] = useState<ClienteOption | null>(
    row.linkedClienteRef ?
      { ref: row.linkedClienteRef, nome: row.linkedClienteNome || row.linkedClienteRef }
    : null,
  );
  const [selProg, setSelProg] = useState<ProgramacaoOption | null>(
    row.linkedProgramacaoId ?
      {
        id: row.linkedProgramacaoId,
        nome: row.linkedProgramacaoNome || row.linkedProgramacaoId,
        clienteRef: row.linkedClienteRef,
        clienteNome: row.linkedClienteNome,
      }
    : null,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      void fetch(`/api/criacao/clientes?q=${encodeURIComponent(clienteQ)}`)
        .then((r) => r.json())
        .then((d: { clientes?: ClienteOption[] }) => setClientes(d.clientes ?? []))
        .catch(() => setClientes([]));
    }, 200);
    return () => clearTimeout(t);
  }, [open, clienteQ]);

  useEffect(() => {
    if (!open || !selCliente) {
      setProgramacoes([]);
      return;
    }
    void fetch(
      `/api/criacao/programacoes?clienteRef=${encodeURIComponent(selCliente.ref)}`,
    )
      .then((r) => r.json())
      .then(
        (d: {
          programacoes?: Array<{ id: string; nome: string; clienteRef: string; clienteNome: string }>;
        }) =>
          setProgramacoes(
            (d.programacoes ?? []).map((p) => ({
              id: p.id,
              nome: p.nome,
              clienteRef: p.clienteRef,
              clienteNome: p.clienteNome,
            })),
          ),
      )
      .catch(() => setProgramacoes([]));
  }, [open, selCliente]);

  async function confirm() {
    setSaving(true);
    try {
      await onSave({
        linkedClienteRef: selCliente?.ref ?? "",
        linkedClienteNome: selCliente?.nome ?? "",
        linkedProgramacaoId: selProg?.id ?? "",
        linkedProgramacaoNome: selProg?.nome ?? "",
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const hasLink = Boolean(row.linkedProgramacaoId && row.linkedClienteRef);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          "mt-0.5 block max-w-full truncate text-left text-[10px] underline decoration-dotted " +
          (hasLink ? "text-emerald-700 dark:text-emerald-300" : "text-slate-500")
        }
        title={hasLink ? `${row.linkedClienteNome} · ${row.linkedProgramacaoNome}` : "Vincular cliente/programação"}
      >
        {hasLink ? `${row.linkedClienteNome} · ${row.linkedProgramacaoNome}` : "Vincular…"}
      </button>
      {open ?
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-2 text-sm font-bold">Vincular programação</h3>
            <p className="mb-3 text-xs text-slate-500">
              Só grava referência nesta planilha — não altera dados do portal.
            </p>
            <label className="mb-2 block text-xs font-semibold text-slate-600">Cliente</label>
            <input
              value={clienteQ}
              onChange={(e) => setClienteQ(e.target.value)}
              placeholder="Buscar cliente…"
              className="mb-2 w-full rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <div className="mb-3 max-h-32 overflow-auto rounded border border-slate-100 dark:border-slate-800">
              {clientes.map((c) => (
                <button
                  key={c.ref}
                  type="button"
                  onClick={() => {
                    setSelCliente(c);
                    setSelProg(null);
                  }}
                  className={
                    "block w-full px-2 py-1 text-left text-xs hover:bg-violet-50 dark:hover:bg-violet-950/40 " +
                    (selCliente?.ref === c.ref ? "bg-violet-100 font-semibold dark:bg-violet-950/60" : "")
                  }
                >
                  {c.nome}
                </button>
              ))}
            </div>
            {selCliente ?
              <>
                <label className="mb-2 block text-xs font-semibold text-slate-600">Programação</label>
                <div className="mb-4 max-h-40 overflow-auto rounded border border-slate-100 dark:border-slate-800">
                  {programacoes.length === 0 ?
                    <p className="px-2 py-2 text-xs text-slate-400">Nenhuma programação.</p>
                  : programacoes.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelProg(p)}
                        className={
                          "block w-full px-2 py-1 text-left text-xs hover:bg-emerald-50 dark:hover:bg-emerald-950/40 " +
                          (selProg?.id === p.id ?
                            "bg-emerald-100 font-semibold dark:bg-emerald-950/60"
                          : "")
                        }
                      >
                        {p.nome}
                      </button>
                    ))
                  }
                </div>
              </>
            : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-slate-200 px-3 py-1 text-xs dark:border-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving || !selCliente || !selProg}
                onClick={() => void confirm()}
                className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Salvar vínculo"}
              </button>
            </div>
          </div>
        </div>
      : null}
    </>
  );
}

function EditableCell({
  value,
  onCommit,
  multiline,
  kind = "default",
  className,
}: {
  value: string;
  onCommit: (next: string) => Promise<void>;
  multiline?: boolean;
  kind?: "default" | "date" | "progress" | "obs-producao";
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const askedTodayRef = useRef(false);
  useEffect(() => {
    setDraft(value);
    askedTodayRef.current = false;
  }, [value]);

  async function commit() {
    if (draft === value) return;
    setSaving(true);
    try {
      await onCommit(draft);
    } catch {
      setDraft(value);
    } finally {
      setSaving(false);
    }
  }

  function handleFocus() {
    if (kind !== "date" || fieldFilled(draft) || askedTodayRef.current) return;
    askedTodayRef.current = true;
    if (window.confirm("Marcar o dia de hoje?")) {
      setDraft(todayPtBr());
    }
  }

  const filledClass =
    kind === "progress" || kind === "date" ? filledFieldClass("progress", draft)
    : kind === "obs-producao" ? filledFieldClass("obs-producao", draft)
    : "";

  const common =
    "w-full min-w-0 rounded border border-transparent px-1 py-0.5 text-xs focus:border-violet-400 focus:outline-none " +
    (filledClass || "bg-transparent focus:bg-white dark:focus:bg-slate-950 ") +
    (className ?? "");

  if (multiline) {
    return (
      <textarea
        value={draft}
        disabled={saving}
        rows={2}
        onFocus={handleFocus}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        className={common + " resize-y"}
      />
    );
  }

  return (
    <input
      value={draft}
      disabled={saving}
      onFocus={handleFocus}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      className={common}
    />
  );
}

function RioStatusBadge({ tag }: { tag: RioTagCobranca | null }) {
  if (!tag || tag === "cobrando") return null;
  const label = rioTagCobrancaSuffix(tag) ?? tag;
  const cls =
    tag === "cancelado" ? "bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-100"
    : tag === "bloqueio_financeiro" ? "bg-orange-200 text-orange-900 dark:bg-orange-950 dark:text-orange-100"
    : "bg-violet-200 text-violet-900 dark:bg-violet-950 dark:text-violet-100";
  return (
    <span className={"mt-0.5 inline-block rounded px-1 py-px text-[10px] font-bold uppercase " + cls}>
      Rio · {label}
    </span>
  );
}

export function PlanilhaProdPanel() {
  const [months, setMonths] = useState<PlanilhaProdMonthDto[]>([]);
  const [monthId, setMonthId] = useState<string>("");
  const [rows, setRows] = useState<PlanilhaProdRowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [migrationPendente, setMigrationPendente] = useState(false);
  const [busca, setBusca] = useState("");
  const [somenteAtivos, setSomenteAtivos] = useState(false);
  const [filtroSistema, setFiltroSistema] = useState<PlanilhaProdSistema | null>(null);
  const [ordemPor, setOrdemPor] = useState<PlanilhaProdSortMode>("cliente");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [importando, setImportando] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadMonths = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/criacao/planilha-prod/months");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        months?: PlanilhaProdMonthDto[];
        migrationPendente?: boolean;
      };
      setMigrationPendente(Boolean(data.migrationPendente));
      const list = data.months ?? [];
      setMonths(list);
      setMonthId((prev) => (prev && list.some((m) => m.id === prev) ? prev : (list[0]?.id ?? "")));
    } catch {
      setMonths([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRows = useCallback(async (id: string) => {
    if (!id) {
      setRows([]);
      return;
    }
    setLoadingRows(true);
    try {
      const res = await fetch(`/api/criacao/planilha-prod/month/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { rows?: PlanilhaProdRowDto[] };
      setRows(data.rows ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  }, []);

  useEffect(() => {
    void loadMonths();
  }, [loadMonths]);

  useEffect(() => {
    void loadRows(monthId);
    setExpandedGroups(new Set());
    setFiltroSistema(null);
    setSomenteAtivos(false);
  }, [monthId, loadRows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filtroSistema) list = list.filter((r) => r.sistema === filtroSistema);
    else if (somenteAtivos) list = list.filter(isRowAtivo);
    const q = busca.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.clienteLabel.toLowerCase().includes(q) ||
        r.criativo.toLowerCase().includes(q) ||
        r.linkedClienteNome.toLowerCase().includes(q) ||
        r.linkedProgramacaoNome.toLowerCase().includes(q),
    );
  }, [rows, busca, somenteAtivos, filtroSistema]);

  const groups = useMemo(() => buildCriadorGroups(filtered, ordemPor), [filtered, ordemPor]);

  function expandAllGroups() {
    setExpandedGroups(new Set(groups.map((g) => g.key)));
  }

  function collapseAllGroups() {
    setExpandedGroups(new Set());
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function patchRow(rowId: string, patch: Partial<PlanilhaProdRowDto>) {
    const res = await fetch(`/api/criacao/planilha-prod/row/${encodeURIComponent(rowId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as { row?: PlanilhaProdRowDto; error?: string };
    if (!res.ok || !data.row) throw new Error(data.error ?? "save_failed");
    setRows((prev) => prev.map((r) => (r.id === data.row!.id ? data.row! : r)));
  }

  async function deleteRow(row: PlanilhaProdRowDto) {
    if (row.sistema !== "cancelado") return;
    if (!window.confirm(`Apagar linha cancelada «${row.clienteLabel}»?`)) return;
    setDeletingId(row.id);
    try {
      const res = await fetch(`/api/criacao/planilha-prod/row/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(data.error === "so_cancelado" ? "Só linhas Antigo/Cancelado podem ser apagadas." : "Falha ao apagar.");
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } finally {
      setDeletingId(null);
    }
  }

  async function onImport(file: File) {
    setImportando(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/criacao/planilha-prod/import", { method: "POST", body: fd });
      const data = (await res.json()) as { error?: string; months?: number; rows?: number };
      if (!res.ok) {
        alert(data.error ?? "Falha na importação");
        return;
      }
      await loadMonths();
      alert(`Importado: ${data.months ?? 0} aba(s), ${data.rows ?? 0} linha(s).`);
    } finally {
      setImportando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const activeMonth = months.find((m) => m.id === monthId);

  return (
    <div className="mx-auto w-full max-w-[1800px] px-2 py-3 sm:px-3">
      <header className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Criação / Planilha Prod</div>
          <h1 className="text-lg font-bold leading-tight">Planilha operacional · Produção</h1>
          <p className="mt-0.5 max-w-3xl text-xs text-slate-500">
            Kanban manual por criador. Importação traz só abas de 2026. Dados isolados — editar aqui não altera
            programações nem clientes do portal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
            }}
          />
          <button
            type="button"
            disabled={importando || migrationPendente}
            onClick={() => fileRef.current?.click()}
            className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {importando ? "Importando…" : "Importar Excel"}
          </button>
        </div>
      </header>

      {migrationPendente ?
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          Migration pendente — rode{" "}
          <code className="rounded bg-amber-100 px-0.5 dark:bg-amber-900">npx prisma migrate deploy</code>
        </div>
      : null}

      {loading ?
        <p className="py-8 text-center text-xs text-slate-500">Carregando…</p>
      : months.length === 0 ?
        <div className="rounded border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-300">Nenhuma aba importada ainda.</p>
          <p className="mt-1 text-xs text-slate-500">
            Use «Importar Excel» com a planilha ATLS Criação (somente meses de 2026).
          </p>
        </div>
      : <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="flex max-w-full gap-1 overflow-x-auto pb-1">
              {months.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMonthId(m.id)}
                  className={
                    "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide " +
                    (m.id === monthId ?
                      "bg-violet-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300")
                  }
                >
                  {m.label}
                  <span className="ml-1 opacity-70">({m.rowCount})</span>
                </button>
              ))}
            </div>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente ou criador…"
              className="w-full max-w-[220px] rounded-md border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={expandAllGroups}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Abrir todos
            </button>
            <button
              type="button"
              onClick={collapseAllGroups}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Fechar todos
            </button>
            <button
              type="button"
              onClick={() => {
                setFiltroSistema(null);
                setSomenteAtivos((v) => !v);
              }}
              disabled={Boolean(filtroSistema)}
              className={
                "rounded border px-2 py-1 text-[11px] font-semibold disabled:opacity-40 " +
                (somenteAtivos && !filtroSistema ?
                  "border-emerald-500 bg-emerald-100 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950 dark:text-emerald-100"
                : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800")
              }
            >
              {somenteAtivos && !filtroSistema ? "Somente ativos ✓" : "Somente ativos"}
            </button>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ordenar:</span>
            <button
              type="button"
              onClick={() => setOrdemPor("cliente")}
              className={
                "rounded border px-2 py-1 text-[11px] font-semibold " +
                (ordemPor === "cliente" ?
                  "border-violet-500 bg-violet-100 text-violet-900 dark:border-violet-600 dark:bg-violet-950 dark:text-violet-100"
                : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800")
              }
            >
              Cliente / programação{ordemPor === "cliente" ? " ✓" : ""}
            </button>
            <button
              type="button"
              onClick={() => setOrdemPor("sistema")}
              className={
                "rounded border px-2 py-1 text-[11px] font-semibold " +
                (ordemPor === "sistema" ?
                  "border-violet-500 bg-violet-100 text-violet-900 dark:border-violet-600 dark:bg-violet-950 dark:text-violet-100"
                : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800")
              }
            >
              Sistema{ordemPor === "sistema" ? " ✓" : ""}
            </button>
            <span className="hidden h-4 w-px bg-slate-200 sm:inline dark:bg-slate-700" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Filtrar:</span>
            {FILTRO_SISTEMA_OPTIONS.map((sistema) => (
              <button
                key={sistema}
                type="button"
                onClick={() => {
                  setSomenteAtivos(false);
                  setFiltroSistema((prev) => (prev === sistema ? null : sistema));
                }}
                className={sistemaFilterButtonClass(sistema, filtroSistema === sistema)}
              >
                {PLANILHA_PROD_SISTEMA_LABEL[sistema]}
              </button>
            ))}
            {filtroSistema ?
              <button
                type="button"
                onClick={() => setFiltroSistema(null)}
                className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Limpar filtro
              </button>
            : null}
            {activeMonth ?
              <span className="ml-auto text-xs text-slate-500">
                {activeMonth.label} · {filtered.length} linha(s) · {groups.length} criador(es)
              </span>
            : null}
          </div>

          {loadingRows ?
            <p className="py-8 text-center text-xs text-slate-500">Carregando linhas…</p>
          : groups.length === 0 ?
            <p className="rounded border border-dashed border-slate-300 py-8 text-center text-xs text-slate-500 dark:border-slate-700">
              Nenhuma linha nesta aba.
            </p>
          : <div className="space-y-2">
              {groups.map((group) => {
                const aberto = expandedGroups.has(group.key);
                return (
                <section
                  key={group.key}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="flex w-full items-center gap-2 border-b border-slate-100 px-2 py-1.5 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                  >
                    <span className="text-[10px] text-slate-400">{aberto ? "▼" : "▶"}</span>
                    <span className="text-xs font-bold uppercase text-slate-700 dark:text-slate-200">{group.nome}</span>
                    <span className="text-[10px] text-slate-500">{group.rows.length} linha(s)</span>
                    {!aberto ?
                      <span className="ml-auto text-[10px] text-slate-400">clique para expandir</span>
                    : null}
                  </button>
                  {aberto ?
                  <div className="overflow-x-auto">
                  <table className="min-w-[1200px] w-full table-fixed text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/90 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/60">
                        {PLANILHA_PROD_COLUMNS.map((col) => (
                          <th key={col.key} className="px-1 py-1" style={{ width: col.width }}>
                            {col.label}
                          </th>
                        ))}
                        <th className="w-[3.5rem] px-1 py-1">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {group.rows.map((row) => (
                        <tr key={row.id} className={resolveRowVisual(row)}>
                          <td className="px-1 py-0.5 align-top">
                            <select
                              value={row.sistema}
                              onChange={(e) =>
                                void patchRow(row.id, { sistema: e.target.value as PlanilhaProdSistema })
                              }
                              className={
                                "w-full rounded px-1 py-0.5 text-[11px] font-bold " + sistemaCellClass(row.sistema)
                              }
                            >
                              <option value="painel">{PLANILHA_PROD_SISTEMA_LABEL.painel}</option>
                              <option value="dois_sistemas">{PLANILHA_PROD_SISTEMA_LABEL.dois_sistemas}</option>
                              <option value="player5">{PLANILHA_PROD_SISTEMA_LABEL.player5}</option>
                              <option value="cancelado">{PLANILHA_PROD_SISTEMA_LABEL.cancelado}</option>
                            </select>
                          </td>
                          <td className="px-1 py-0.5 align-top">
                            <EditableCell
                              value={row.clienteLabel}
                              onCommit={(v) => patchRow(row.id, { clienteLabel: v })}
                            />
                            <RioStatusBadge tag={row.linkedRioTagCobranca} />
                            {row.sistema === "dois_sistemas" || row.sistema === "player5" ?
                              <>
                                <VinculoPicker row={row} onSave={(p) => patchRow(row.id, p)} />
                                {row.sistema === "player5" &&
                                !(row.linkedClienteRef && row.linkedProgramacaoId) ?
                                  <span className="mt-0.5 block text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                    PLAYER 5 — vincule cliente e programação
                                  </span>
                                : null}
                              </>
                            : null}
                          </td>
                          <td className="px-1 py-0.5 align-top">
                            <EditableCell
                              value={row.criativo}
                              onCommit={(v) => patchRow(row.id, { criativo: v })}
                            />
                          </td>
                          <td className="px-1 py-0.5 align-top">
                            <EditableCell
                              value={row.entregaAtl}
                              kind="date"
                              onCommit={(v) => patchRow(row.id, { entregaAtl: v })}
                            />
                          </td>
                          <td className="px-1 py-0.5 align-top">
                            <EditableCell
                              value={row.convertidoGain}
                              kind="date"
                              onCommit={(v) => patchRow(row.id, { convertidoGain: v })}
                            />
                          </td>
                          <td className="px-1 py-0.5 align-top">
                            <EditableCell
                              value={row.arrastado}
                              kind="date"
                              onCommit={(v) => patchRow(row.id, { arrastado: v })}
                            />
                          </td>
                          <td className="px-1 py-0.5 align-top">
                            <EditableCell
                              value={row.sincronizado}
                              kind="date"
                              onCommit={(v) => patchRow(row.id, { sincronizado: v })}
                            />
                          </td>
                          <td className="px-1 py-0.5 align-top">
                            <EditableCell
                              value={row.statusPlayerNovo}
                              kind="progress"
                              onCommit={(v) => patchRow(row.id, { statusPlayerNovo: v })}
                            />
                          </td>
                          <td className="px-1 py-0.5 align-top">
                            <EditableCell
                              value={row.obsCriacao}
                              multiline
                              onCommit={(v) => patchRow(row.id, { obsCriacao: v })}
                            />
                          </td>
                          <td className="px-1 py-0.5 align-top">
                            <EditableCell
                              value={row.obsProducao}
                              kind="obs-producao"
                              multiline
                              onCommit={(v) => patchRow(row.id, { obsProducao: v })}
                            />
                          </td>
                          <td className="px-1 py-0.5 align-top">
                            {row.sistema === "cancelado" ?
                              <button
                                type="button"
                                disabled={deletingId === row.id}
                                onClick={() => void deleteRow(row)}
                                className="text-[10px] font-bold text-red-700 hover:underline disabled:opacity-50 dark:text-red-300"
                                title="Apagar linha cancelada"
                              >
                                {deletingId === row.id ? "…" : "Apagar"}
                              </button>
                            : <span className="text-[10px] text-slate-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  : null}
                </section>
                );
              })}
            </div>
          }
        </>
      }
    </div>
  );
}
