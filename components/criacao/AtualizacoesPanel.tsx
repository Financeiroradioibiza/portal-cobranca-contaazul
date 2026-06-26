"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { competenciaLabel } from "@/lib/criacao/competencia";
import type { FechamentoPainelItem, PainelRow } from "@/lib/criacao/atualizacaoPainelService";
import { useProgramacaoDonoMap } from "@/lib/criacao/useProgramacaoDonoMap";

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

function FechamentoBadges({ items }: { items: FechamentoPainelItem[] }) {
  if (items.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((f) => (
        <span
          key={f.atualizacaoId}
          title={fmtWhen(f.em)}
          className={
            "rounded px-1.5 py-0.5 text-[10px] font-bold " +
            (f.tipo === "install" ?
              "bg-emerald-600 text-white"
            : f.tipo === "especial" ?
              "bg-violet-600 text-white"
            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200")
          }
        >
          {f.rotulo}
        </span>
      ))}
    </div>
  );
}

function DonoChip({ programacaoId, map }: { programacaoId: string; map: Record<string, { criativoIniciais: string; criativoCor: string; criativoNome: string }> }) {
  const dono = map[programacaoId];
  if (!dono) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span
      className="inline-flex h-6 min-w-[2rem] items-center justify-center rounded px-1 text-[10px] font-bold text-white"
      style={{ backgroundColor: dono.criativoCor || "#6366f1" }}
      title={dono.criativoNome}
    >
      {dono.criativoIniciais || "?"}
    </span>
  );
}

export function AtualizacoesPanel() {
  const { map: donoMap } = useProgramacaoDonoMap();
  const [competencia, setCompetencia] = useState("");
  const [competencias, setCompetencias] = useState<string[]>([]);
  const [rows, setRows] = useState<PainelRow[]>([]);
  const [migrationPendente, setMigrationPendente] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async (comp?: string) => {
    setLoading(true);
    try {
      const q = comp ? `?competencia=${encodeURIComponent(comp)}` : "";
      const res = await fetch(`/api/criacao/atualizacoes/painel${q}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        competencia?: string;
        competencias?: string[];
        rows?: PainelRow[];
        migrationPendente?: boolean;
      };
      if (data.competencia) setCompetencia(data.competencia);
      if (data.competencias) setCompetencias(data.competencias);
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

  const grouped = useMemo(() => {
    const map = new Map<string, PainelRow[]>();
    for (const row of filtered) {
      const key = row.clienteNome.trim() || row.clienteRef;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [filtered]);

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
    <div className="mx-auto max-w-[1400px] px-3 py-6 sm:px-4">
      <header className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Criação / Atualizações</div>
        <h1 className="text-2xl font-bold tracking-tight">Painel de atualizações</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Acompanhe por competência: entrega do criativo, subida na fila e fechamentos (INSTALL, ATL, ESPECIAL).
        </p>
      </header>

      {migrationPendente ?
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          Migration do painel ainda não aplicada no banco. Peça para rodar{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">npx prisma migrate deploy</code> no Neon.
        </div>
      : null}

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {competencias.map((c) => {
          const on = c === competencia;
          return (
            <button
              key={c}
              type="button"
              onClick={() => void load(c)}
              className={
                "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition " +
                (on ?
                  "bg-slate-900 text-white shadow-md dark:bg-orange-600"
                : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300")
              }
            >
              {competenciaLabel(c)}
            </button>
          );
        })}
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Programações", value: stats.total, tone: "text-slate-900 dark:text-slate-100" },
          { label: "Criativo entregou", value: stats.entregues, tone: "text-amber-600" },
          { label: "Subida na fila", value: stats.fila, tone: "text-sky-600" },
          { label: "Atualizadas", value: stats.fechados, tone: "text-emerald-600" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold ${s.tone}`}>{loading ? "…" : s.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente ou programação…"
          className="w-full max-w-md rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
      </div>

      {loading ?
        <p className="py-12 text-center text-sm text-slate-500">Carregando painel…</p>
      : grouped.length === 0 ?
        <p className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500 dark:border-slate-700">
          Nenhuma programação encontrada.
        </p>
      : <div className="space-y-4">
          {grouped.map(([clienteLabel, progs]) => (
            <section
              key={clienteLabel}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-orange-50/40 px-4 py-3 dark:border-slate-800 dark:from-slate-900 dark:to-orange-950/20">
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{clienteLabel}</h2>
                <p className="text-[10px] text-slate-500">{progs.length} programação(ões)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                      <th className="px-4 py-2.5">Programação</th>
                      <th className="px-3 py-2.5">Dono</th>
                      <th className="px-3 py-2.5">1 · Criativo entregou</th>
                      <th className="px-3 py-2.5">2 · Subida fila</th>
                      <th className="px-3 py-2.5">3 · Atualizado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {progs.map((row) => (
                      <tr key={row.programacaoId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                          {row.programacaoNome}
                        </td>
                        <td className="px-3 py-3">
                          <DonoChip programacaoId={row.programacaoId} map={donoMap} />
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            disabled={savingId === row.programacaoId}
                            onClick={() => void toggleEntregue(row)}
                            title={
                              row.criativoEntregue ?
                                `${row.criativoEntreguePor} · ${fmtWhen(row.criativoEntregueEm)}`
                              : "Marcar entrega do criativo"
                            }
                            className={
                              "inline-flex h-9 min-w-[9rem] items-center justify-center gap-2 rounded-lg border-2 px-3 text-xs font-bold transition " +
                              (row.criativoEntregue ?
                                "border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200"
                              : "border-dashed border-slate-300 text-slate-400 hover:border-amber-300 hover:text-amber-700 dark:border-slate-600")
                            }
                          >
                            {row.criativoEntregue ? "✓ Entregue" : "Marcar"}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          {row.subidaFila ?
                            <span
                              className="inline-flex items-center gap-1 rounded-lg bg-sky-100 px-2.5 py-1.5 text-xs font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-200"
                              title={`${row.subidaFilaPor} · ${fmtWhen(row.subidaFilaEm)}`}
                            >
                              ✓ Na fila
                            </span>
                          : <span className="text-xs text-slate-400">Aguardando upload</span>}
                        </td>
                        <td className="px-3 py-3">
                          <FechamentoBadges items={row.fechamentos} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      }
    </div>
  );
}
