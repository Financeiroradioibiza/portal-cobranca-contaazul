"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { competenciaLabel } from "@/lib/criacao/competencia";
import type { FechamentoPainelItem, PainelRow } from "@/lib/criacao/atualizacaoPainelService";
import type { ProgramacaoDono } from "@/lib/criacao/programacaoDonoLocal";
import { useProgramacaoDonoMap } from "@/lib/criacao/useProgramacaoDonoMap";

const SEM_DONO_KEY = "__sem_dono__";

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type DonoGroup = {
  key: string;
  iniciais: string;
  nome: string;
  cor: string;
  rows: PainelRow[];
};

function buildDonoGroups(rows: PainelRow[], donoMap: Record<string, ProgramacaoDono>): DonoGroup[] {
  const map = new Map<string, DonoGroup>();

  for (const row of rows) {
    const dono = donoMap[row.programacaoId];
    const key = dono?.criativoEmail ?? SEM_DONO_KEY;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        iniciais: dono?.criativoIniciais?.trim().toUpperCase() || "?",
        nome: dono?.criativoNome ?? "Sem dono",
        cor: dono?.criativoCor ?? "#94a3b8",
        rows: [],
      };
      map.set(key, group);
    }
    group.rows.push(row);
  }

  for (const g of map.values()) {
    g.rows.sort(
      (a, b) =>
        (a.clienteNome || a.clienteRef).localeCompare(b.clienteNome || b.clienteRef, "pt-BR") ||
        a.programacaoNome.localeCompare(b.programacaoNome, "pt-BR"),
    );
  }

  return [...map.values()].sort((a, b) => {
    if (a.key === SEM_DONO_KEY) return 1;
    if (b.key === SEM_DONO_KEY) return -1;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

function FechamentoBadges({ items }: { items: FechamentoPainelItem[] }) {
  if (items.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-0.5">
      {items.map((f) => (
        <span
          key={f.atualizacaoId}
          title={`${f.rotulo} · ${fmtWhen(f.em)}`}
          className={
            "rounded px-1 py-px text-[10px] font-bold leading-tight " +
            (f.tipo === "install" ?
              "bg-emerald-600 text-white"
            : f.tipo === "especial" ?
              "bg-violet-600 text-white"
            : f.tipo === "off" ?
              "bg-slate-600 text-white"
            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100")
          }
        >
          {f.rotulo}
        </span>
      ))}
    </div>
  );
}

export function AtualizacoesPanel() {
  const { map: donoMap } = useProgramacaoDonoMap();
  const [competencia, setCompetencia] = useState("");
  const [rows, setRows] = useState<PainelRow[]>([]);
  const [migrationPendente, setMigrationPendente] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/criacao/atualizacoes/painel");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        competencia?: string;
        rows?: PainelRow[];
        migrationPendente?: boolean;
      };
      if (data.competencia) setCompetencia(data.competencia);
      setMigrationPendente(Boolean(data.migrationPendente));
      setRows(data.rows ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.clienteNome.toLowerCase().includes(q) ||
        r.programacaoNome.toLowerCase().includes(q) ||
        r.clienteRef.toLowerCase().includes(q),
    );
  }, [rows, busca]);

  const donoGroups = useMemo(() => buildDonoGroups(filtered, donoMap), [filtered, donoMap]);

  const stats = useMemo(() => {
    let entregues = 0;
    let fila = 0;
    let fechados = 0;
    for (const r of rows) {
      if (r.criativoEntregue) entregues++;
      if (r.subidaFila) fila++;
      if (r.fechamentos.length > 0) fechados++;
    }
    return { total: rows.length, entregues, fila, fechados };
  }, [rows]);

  async function toggleEntregue(row: PainelRow) {
    setSavingId(row.programacaoId);
    try {
      const res = await fetch("/api/criacao/atualizacoes/painel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programacaoId: row.programacaoId,
          competencia,
          criativoEntregue: !row.criativoEntregue,
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { row?: PainelRow };
      if (data.row) {
        setRows((prev) => prev.map((r) => (r.programacaoId === data.row!.programacaoId ? data.row! : r)));
      }
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-2 py-3 sm:px-3">
      <header className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Criação / PRODUÇÃO</div>
          <h1 className="text-lg font-bold leading-tight">Painel · {competencia ? competenciaLabel(competencia) : "…"}</h1>
        </div>
        {!loading ?
          <p className="text-xs text-slate-500">
            {stats.total} prog · {stats.entregues} entregues · {stats.fila} na fila · {stats.fechados} fechadas
          </p>
        : null}
      </header>

      {migrationPendente ?
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          Migration pendente — rode <code className="rounded bg-amber-100 px-0.5 dark:bg-amber-900">npx prisma migrate deploy</code>
        </div>
      : null}

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          Competência: {competencia ? competenciaLabel(competencia) : "…"}
        </p>
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar…"
          className="w-full max-w-[200px] rounded-md border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
        />
      </div>

      {loading ?
        <p className="py-8 text-center text-xs text-slate-500">Carregando…</p>
      : donoGroups.length === 0 ?
        <p className="rounded border border-dashed border-slate-300 py-8 text-center text-xs text-slate-500 dark:border-slate-700">
          Nenhuma programação.
        </p>
      : <div className="space-y-2">
          {donoGroups.map((group) => (
            <section
              key={group.key}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <div
                className="flex items-center gap-2 border-b border-slate-100 px-2 py-1 dark:border-slate-800"
                style={{ backgroundColor: `${group.cor}18` }}
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
                  style={{ backgroundColor: group.cor }}
                >
                  {group.iniciais}
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{group.nome}</span>
                <span className="text-[10px] text-slate-500">{group.rows.length} linha(s)</span>
              </div>
              <table className="w-full table-fixed text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/90 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/60">
                    <th className="w-[38%] px-2 py-1">Cliente</th>
                    <th className="w-[28%] px-2 py-1">Programação</th>
                    <th className="w-[11%] px-1 py-1 text-center" title="Criativo entregou">
                      Entregue
                    </th>
                    <th className="w-[11%] px-1 py-1 text-center" title="Subida na fila">
                      Fila
                    </th>
                    <th className="w-[12%] px-1 py-1" title="Atualizado">
                      Fechado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {group.rows.map((row) => (
                    <tr
                      key={row.programacaoId}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="truncate px-2 py-1 font-medium text-slate-800 dark:text-slate-100">
                        {row.clienteNome || row.clienteRef}
                      </td>
                      <td className="truncate px-2 py-1 text-slate-700 dark:text-slate-200">{row.programacaoNome}</td>
                      <td className="px-1 py-1 text-center">
                        <button
                          type="button"
                          disabled={savingId === row.programacaoId}
                          onClick={() => void toggleEntregue(row)}
                          title={
                            row.criativoEntregue ?
                              `${row.criativoEntreguePor} · ${fmtWhen(row.criativoEntregueEm)}`
                            : "Marcar entrega"
                          }
                          className={
                            "inline-flex h-6 w-6 items-center justify-center rounded border text-[11px] font-bold transition " +
                            (row.criativoEntregue ?
                              "border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200"
                            : "border-slate-300 text-slate-400 hover:border-amber-400 dark:border-slate-600")
                          }
                        >
                          {row.criativoEntregue ? "✓" : ""}
                        </button>
                      </td>
                      <td className="px-1 py-1 text-center">
                        {row.subidaFila ?
                          <span
                            className={
                              "inline-flex h-6 items-center justify-center rounded px-1 text-[11px] font-bold " +
                              (row.subidaFilaTemDuplicata ?
                                "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                              : "w-6 bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200")
                            }
                            title={
                              row.subidaFilaTemDuplicata ?
                                `Duplicata pendente · ${row.subidaFilaPor} · ${fmtWhen(row.subidaFilaEm)}`
                              : `${row.subidaFilaPor} · ${fmtWhen(row.subidaFilaEm)}`
                            }
                          >
                            {row.subidaFilaTemDuplicata ? "⚠ dup" : "✓"}
                          </span>
                        : <span className="inline-block h-6 w-6 text-center leading-6 text-slate-300">·</span>}
                      </td>
                      <td className="px-1 py-1">
                        <FechamentoBadges items={row.fechamentos} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      }
    </div>
  );
}
