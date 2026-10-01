"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChamadoView } from "@/lib/chamados/chamadoTypes";
import Link from "next/link";

type AgendaItem = ChamadoView & { prazoLabel?: string };

type ViewMode = "semana" | "dia" | "mes";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangeForMode(mode: ViewMode, anchor: Date): { from: string; to: string; title: string } {
  const a = startOfDay(anchor);
  if (mode === "dia") {
    const end = addDays(a, 1);
    return {
      from: a.toISOString(),
      to: end.toISOString(),
      title: a.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }),
    };
  }
  if (mode === "semana") {
    const dow = a.getDay();
    const mon = addDays(a, dow === 0 ? -6 : 1 - dow);
    const sun = addDays(mon, 7);
    return {
      from: mon.toISOString(),
      to: sun.toISOString(),
      title: `Semana ${toIsoLocal(mon)} – ${toIsoLocal(addDays(sun, -1))}`,
    };
  }
  const first = new Date(a.getFullYear(), a.getMonth(), 1);
  const next = new Date(a.getFullYear(), a.getMonth() + 1, 1);
  return {
    from: first.toISOString(),
    to: next.toISOString(),
    title: first.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
  };
}

export function ChamadosAgendaPanel() {
  const [mode, setMode] = useState<ViewMode>("semana");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => rangeForMode(mode, anchor), [mode, anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ from: range.from, to: range.to });
      const res = await fetch(`/api/chamados/agenda?${q}`, { credentials: "same-origin" });
      const data = res.ok ? await res.json() : null;
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Agenda — prazos de chamados</h2>
          <p className="text-[11px] text-slate-500 capitalize">{range.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              ["dia", "Dia"],
              ["semana", "Semana"],
              ["mes", "Mês"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={
                "rounded-full px-2.5 py-0.5 text-[11px] font-semibold " +
                (mode === id ?
                  "bg-violet-600 text-white"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")
              }
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-2 py-0.5 text-[11px] dark:border-slate-600"
            onClick={() => setAnchor(addDays(anchor, mode === "mes" ? -30 : mode === "semana" ? -7 : -1))}
          >
            ←
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-2 py-0.5 text-[11px] dark:border-slate-600"
            onClick={() => setAnchor(startOfDay(new Date()))}
          >
            Hoje
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-2 py-0.5 text-[11px] dark:border-slate-600"
            onClick={() => setAnchor(addDays(anchor, mode === "mes" ? 30 : mode === "semana" ? 7 : 1))}
          >
            →
          </button>
        </div>
      </div>

      <div className="mt-3 min-h-[4rem]">
        {loading ?
          <p className="text-xs text-slate-500">Carregando…</p>
        : items.length === 0 ?
          <p className="text-xs text-slate-500">Nenhum prazo neste período para você.</p>
        : <ul className="space-y-2">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs dark:border-slate-800"
              >
                <span className="font-bold text-violet-700 dark:text-violet-300">
                  {(it as AgendaItem).prazoLabel ?? "—"}
                </span>
                {it.sequenciaRotulo ?
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                    {it.sequenciaRotulo}
                  </span>
                : null}
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-800 dark:text-slate-100">
                  {it.titulo}
                </span>
                <Link
                  href={`/chamados/kanban?chamado=${encodeURIComponent(it.id)}`}
                  className="shrink-0 font-semibold text-violet-600 hover:underline dark:text-violet-400"
                >
                  Abrir
                </Link>
              </li>
            ))}
          </ul>
        }
      </div>
    </section>
  );
}
