"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PLANILHA_PROD_COLUMNS,
  PLANILHA_PROD_SISTEMA_LABEL,
  type PlanilhaProdMonthDto,
  type PlanilhaProdRowDto,
  type PlanilhaProdSistema,
} from "@/lib/criacao/planilhaProdTypes";

type CriadorGroup = {
  key: string;
  nome: string;
  rows: PlanilhaProdRowDto[];
};

type ClienteOption = { ref: string; nome: string };
type ProgramacaoOption = { id: string; nome: string; clienteRef: string; clienteNome: string };

function buildCriadorGroups(rows: PlanilhaProdRowDto[]): CriadorGroup[] {
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
    g.rows.sort((a, b) => a.sortOrder - b.sortOrder || a.clienteLabel.localeCompare(b.clienteLabel, "pt-BR"));
  }
  return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
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

function rowClass(sistema: PlanilhaProdSistema): string {
  if (sistema === "cancelado") {
    return "bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-100";
  }
  return "hover:bg-slate-50/80 dark:hover:bg-slate-800/40";
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
  className,
}: {
  value: string;
  onCommit: (next: string) => Promise<void>;
  multiline?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(value), [value]);

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

  const common =
    "w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs focus:border-violet-400 focus:bg-white focus:outline-none dark:focus:bg-slate-950 " +
    (className ?? "");

  if (multiline) {
    return (
      <textarea
        value={draft}
        disabled={saving}
        rows={2}
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
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      className={common}
    />
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
  const [importando, setImportando] = useState(false);
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
  }, [monthId, loadRows]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.clienteLabel.toLowerCase().includes(q) ||
        r.criativo.toLowerCase().includes(q) ||
        r.linkedClienteNome.toLowerCase().includes(q) ||
        r.linkedProgramacaoNome.toLowerCase().includes(q),
    );
  }, [rows, busca]);

  const groups = useMemo(() => buildCriadorGroups(filtered), [filtered]);

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
              className="ml-auto w-full max-w-[220px] rounded-md border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
          </div>

          {activeMonth ?
            <p className="mb-2 text-xs text-slate-500">
              {activeMonth.label} · {filtered.length} linha(s) visíveis
            </p>
          : null}

          {loadingRows ?
            <p className="py-8 text-center text-xs text-slate-500">Carregando linhas…</p>
          : groups.length === 0 ?
            <p className="rounded border border-dashed border-slate-300 py-8 text-center text-xs text-slate-500 dark:border-slate-700">
              Nenhuma linha nesta aba.
            </p>
          : <div className="space-y-2">
              {groups.map((group) => (
                <section
                  key={group.key}
                  className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center gap-2 border-b border-slate-100 px-2 py-1 dark:border-slate-800">
                    <span className="text-xs font-bold uppercase text-slate-700 dark:text-slate-200">{group.nome}</span>
                    <span className="text-[10px] text-slate-500">{group.rows.length} linha(s)</span>
                  </div>
                  <table className="min-w-[1200px] w-full table-fixed text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/90 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/60">
                        {PLANILHA_PROD_COLUMNS.map((col) => (
                          <th key={col.key} className="px-1 py-1" style={{ width: col.width }}>
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {group.rows.map((row) => (
                        <tr key={row.id} className={rowClass(row.sistema)}>
                          <td className="px-1 py-0.5 align-top">
                            <select
                              value={row.sistema}
                              disabled={row.sistema === "cancelado"}
                              onChange={(e) =>
                                void patchRow(row.id, { sistema: e.target.value as PlanilhaProdSistema })
                              }
                              className={
                                "w-full rounded px-1 py-0.5 text-[11px] font-bold " + sistemaCellClass(row.sistema)
                              }
                            >
                              {row.sistema === "cancelado" ?
                                <option value="cancelado">{PLANILHA_PROD_SISTEMA_LABEL.cancelado}</option>
                              : <>
                                  <option value="painel">{PLANILHA_PROD_SISTEMA_LABEL.painel}</option>
                                  <option value="dois_sistemas">{PLANILHA_PROD_SISTEMA_LABEL.dois_sistemas}</option>
                                  <option value="player5">{PLANILHA_PROD_SISTEMA_LABEL.player5}</option>
                                </>
                              }
                            </select>
                          </td>
                          <td className="px-1 py-0.5 align-top">
                            <EditableCell
                              value={row.clienteLabel}
                              onCommit={(v) => patchRow(row.id, { clienteLabel: v })}
                            />
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
                              onCommit={(v) => patchRow(row.id, { entregaAtl: v })}
                            />
                          </td>
                          <td className="px-1 py-0.5 align-top">
                            <EditableCell
                              value={row.convertidoGain}
                              onCommit={(v) => patchRow(row.id, { convertidoGain: v })}
                            />
                          </td>
                          <td className="px-1 py-0.5 align-top">
                            <EditableCell
                              value={row.arrastado}
                              onCommit={(v) => patchRow(row.id, { arrastado: v })}
                            />
                          </td>
                          <td className="px-1 py-0.5 align-top">
                            <EditableCell
                              value={row.sincronizado}
                              onCommit={(v) => patchRow(row.id, { sincronizado: v })}
                            />
                          </td>
                          <td className="px-1 py-0.5 align-top">
                            <EditableCell
                              value={row.statusPlayerNovo}
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
                              multiline
                              onCommit={(v) => patchRow(row.id, { obsProducao: v })}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
          }
        </>
      }
    </div>
  );
}
