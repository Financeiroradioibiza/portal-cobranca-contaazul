"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RelatorioTipo = "gravadoras" | "artistas" | "musicas" | "tags";
type RelatorioLimit = 10 | 50 | 100;
type RelatorioRow = { label: string; count: number; meta?: string };

const CARDS: {
  id: RelatorioTipo;
  title: string;
  subtitle: string;
  gradient: string;
}[] = [
  { id: "gravadoras", title: "Top gravadoras", subtitle: "Mais presentes nas programações", gradient: "from-violet-600 to-indigo-800" },
  { id: "artistas", title: "Top artistas", subtitle: "Artistas mais programados", gradient: "from-emerald-600 to-teal-800" },
  { id: "musicas", title: "Top músicas", subtitle: "Faixas com mais clientes", gradient: "from-orange-500 to-red-700" },
  { id: "tags", title: "Top estilos / tags", subtitle: "Tags de criativos ([LA] POP…)", gradient: "from-pink-500 to-purple-800" },
];

function rankStyle(index: number): string {
  if (index === 0) return "bg-gradient-to-br from-amber-400 to-orange-500 text-white";
  if (index === 1) return "bg-gradient-to-br from-slate-300 to-slate-400 text-slate-900";
  if (index === 2) return "bg-gradient-to-br from-amber-700 to-amber-900 text-amber-50";
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

export function CriacaoRelatoriosPanel() {
  const [tipo, setTipo] = useState<RelatorioTipo>("musicas");
  const [limit, setLimit] = useState<RelatorioLimit>(10);
  const [rows, setRows] = useState<RelatorioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const card = useMemo(() => CARDS.find((c) => c.id === tipo) ?? CARDS[2]!, [tipo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/criacao/relatorios?tipo=${tipo}&limit=${limit}`);
      if (!res.ok) throw new Error("load_failed");
      const data = (await res.json()) as { rows?: RelatorioRow[] };
      setRows(data.rows ?? []);
    } catch {
      setError("Não foi possível carregar o relatório.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tipo, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxCount = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Criação / Relatórios</div>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Relatórios</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">
        O que mais aparece nas programações dos clientes — visual inspirado no Spotify.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setTipo(c.id)}
            className={`rounded-2xl bg-gradient-to-br ${c.gradient} p-5 text-left text-white shadow-lg transition ${
              tipo === c.id ? "ring-4 ring-white/40 scale-[1.02]" : "opacity-85 hover:opacity-100"
            }`}
          >
            <div className="text-lg font-bold">{c.title}</div>
            <div className="mt-1 text-xs text-white/80">{c.subtitle}</div>
          </button>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{card.title}</h2>
          <p className="text-sm text-slate-500">Ranking por uso em programações</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
          {([10, 50, 100] as RelatorioLimit[]).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setLimit(n)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold ${
                limit === n ?
                  "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-300"
              }`}
            >
              Top {n}
            </button>
          ))}
        </div>
      </div>

      {loading ?
        <div className="mt-8 text-sm text-slate-500">Carregando…</div>
      : error ?
        <div className="mt-8 text-sm text-red-600">{error}</div>
      : rows.length === 0 ?
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-700">
          Ainda não há dados — publique programações com músicas da biblioteca.
        </div>
      : (
        <ol className="mt-6 space-y-2">
          {rows.map((row, index) => (
            <li
              key={`${row.label}-${index}`}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black ${rankStyle(index)}`}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-slate-900 dark:text-slate-100">{row.label}</div>
                {row.meta ?
                  <div className="truncate text-xs text-slate-500">{row.meta}</div>
                : null}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                    style={{ width: `${Math.max(8, (row.count / maxCount) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-lg font-black tabular-nums text-slate-800 dark:text-slate-100">{row.count}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">prog.</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
