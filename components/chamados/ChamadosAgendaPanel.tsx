"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChamadoView } from "@/lib/chamados/chamadoTypes";
import Link from "next/link";

type AgendaItem = ChamadoView & { prazoLabel?: string };

type AgendaSequenciaTimeline = {
  grupoId: string;
  titulo: string;
  templateKind: string | null;
  passos: {
    chamadoId: string;
    passo: number;
    total: number;
    rotulo: string | null;
    prazoLabel: string;
    prazoEntrega: string;
    status: string;
  }[];
};

type ViewMode = "semana" | "dia" | "mes";

const DAY_PARTS = [
  { id: "manha", label: "Manhã" },
  { id: "tarde", label: "Tarde" },
  { id: "noite", label: "Noite" },
] as const;

const PART_ROW = "min-h-[4.5rem]";

const WEEKDAY_SHORT = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."] as const;

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

function prazoDayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
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

function weekDaysFromAnchor(anchor: Date): Date[] {
  const a = startOfDay(anchor);
  const dow = a.getDay();
  const mon = addDays(a, dow === 0 ? -6 : 1 - dow);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

function monthGridCells(anchor: Date): { date: Date; inMonth: boolean; key: string }[] {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const first = new Date(y, m, 1);
  const start = addDays(first, -first.getDay());
  const cells: { date: Date; inMonth: boolean; key: string }[] = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i);
    cells.push({
      date,
      inMonth: date.getMonth() === m,
      key: toIsoLocal(date),
    });
  }
  return cells;
}

function groupItemsByDay(items: AgendaItem[]): Map<string, AgendaItem[]> {
  const map = new Map<string, AgendaItem[]>();
  for (const it of items) {
    if (!it.prazoEntrega) continue;
    const key = prazoDayKey(it.prazoEntrega);
    const list = map.get(key) ?? [];
    list.push(it);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.prazoEntrega ?? "").localeCompare(b.prazoEntrega ?? ""));
  }
  return map;
}

function AgendaEventChip({ it }: { it: AgendaItem }) {
  const seq = Boolean(it.sequenciaGrupoId);
  return (
    <Link
      href={`/chamados/kanban?chamado=${encodeURIComponent(it.id)}`}
      className={
        "block rounded-md border px-1.5 py-1 text-[10px] leading-tight " +
        (seq ?
          "border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-100 dark:hover:bg-emerald-900"
        : "border-violet-200 bg-violet-50 text-violet-950 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/80 dark:text-violet-100 dark:hover:bg-violet-900")
      }
      title={it.titulo}
    >
      {it.sequenciaRotulo ?
        <span className="mb-0.5 block truncate font-bold text-amber-800 dark:text-amber-200">
          {it.sequenciaRotulo}
        </span>
      : null}
      {seq && it.sequenciaPasso && it.sequenciaTotal ?
        <span className="font-bold tabular-nums">
          {it.sequenciaPasso}/{it.sequenciaTotal}
        </span>
      : null}
      <span className="line-clamp-2 font-semibold">{it.titulo}</span>
    </Link>
  );
}

function AgendaSequenciaTimelines({ timelines }: { timelines: AgendaSequenciaTimeline[] }) {
  if (timelines.length === 0) return null;
  return (
    <div className="mb-3 space-y-2">
      {timelines.map((seq) => (
        <div
          key={seq.grupoId}
          className="rounded-xl border border-emerald-300/80 bg-emerald-50/90 p-3 dark:border-emerald-800 dark:bg-emerald-950/40"
        >
          <p className="text-xs font-bold text-emerald-950 dark:text-emerald-100">
            {seq.titulo}
            <span className="ml-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
              (SEQUÊNCIA)
            </span>
          </p>
          <div className="mt-2 flex flex-wrap items-stretch gap-1">
            {seq.passos.map((p, idx) => {
              const active = p.status === "aberto" || p.status === "em_andamento";
              const done = p.status === "fechado";
              return (
                <div key={p.chamadoId} className="flex min-w-0 flex-1 items-center gap-1">
                  {idx > 0 ?
                    <span className="hidden shrink-0 text-emerald-400 sm:inline" aria-hidden>
                      →
                    </span>
                  : null}
                  <Link
                    href={`/chamados/kanban?chamado=${encodeURIComponent(p.chamadoId)}`}
                    className={
                      "min-w-[4.5rem] flex-1 rounded-lg border px-2 py-1.5 text-center text-[10px] leading-tight transition " +
                      (active ?
                        "border-emerald-600 bg-emerald-600 font-bold text-white shadow-sm"
                      : done ?
                        "border-emerald-200 bg-white/60 text-emerald-800 opacity-80 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                      : "border-emerald-200 bg-white text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100")
                    }
                    title={p.rotulo ?? undefined}
                  >
                    <div className="font-bold tabular-nums">
                      {p.passo}/{p.total}
                    </div>
                    <div className="mt-0.5 font-semibold">{p.prazoLabel}</div>
                    {p.rotulo ?
                      <div className="mt-0.5 line-clamp-2 text-[9px] font-medium opacity-90">{p.rotulo}</div>
                    : null}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimeGrid({
  days,
  itemsByDay,
  todayKey,
  loading,
}: {
  days: Date[];
  itemsByDay: Map<string, AgendaItem[]>;
  todayKey: string;
  loading: boolean;
}) {
  const colCount = days.length;
  const gridCols = `3rem repeat(${colCount}, minmax(0, 1fr))`;

  return (
    <div
      className={
        "overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 " +
        (loading ? "opacity-60" : "")
      }
    >
      <div className="min-w-[520px]">
        <div className="grid border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50" style={{ gridTemplateColumns: gridCols }}>
          <div className="border-r border-slate-200 dark:border-slate-700" />
          {days.map((day) => {
            const key = toIsoLocal(day);
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className="border-r border-slate-200 px-1 py-2 text-center last:border-r-0 dark:border-slate-700"
              >
                <div className="text-[10px] font-medium uppercase text-slate-500 dark:text-slate-400">
                  {WEEKDAY_SHORT[day.getDay()]}
                </div>
                <div
                  className={
                    "mx-auto mt-0.5 flex h-7 w-7 items-center justify-center text-sm font-bold " +
                    (isToday ?
                      "rounded-full bg-red-600 text-white"
                    : "text-slate-800 dark:text-slate-100")
                  }
                >
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid border-b border-slate-200 dark:border-slate-700" style={{ gridTemplateColumns: gridCols }}>
          <div className="flex items-start justify-end border-r border-slate-200 px-1 py-2 text-[9px] font-semibold text-slate-400 dark:border-slate-700">
            Prazo
          </div>
          {days.map((day) => {
            const key = toIsoLocal(day);
            const dayItems = itemsByDay.get(key) ?? [];
            return (
              <div
                key={`prazo-${key}`}
                className="min-h-[3rem] space-y-1 border-r border-slate-200 p-1 last:border-r-0 dark:border-slate-700"
              >
                {dayItems.map((it) => (
                  <AgendaEventChip key={it.id} it={it} />
                ))}
              </div>
            );
          })}
        </div>

        <div className="grid" style={{ gridTemplateColumns: gridCols }}>
          {DAY_PARTS.map((part) => (
            <div key={part.id} className="contents">
              <div
                className={
                  `${PART_ROW} flex items-start justify-end border-b border-r border-slate-200 px-1 pt-2 text-right text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400`
                }
              >
                {part.label}
              </div>
              {days.map((day) => {
                const key = `${toIsoLocal(day)}-${part.id}`;
                return (
                  <div
                    key={key}
                    className={`${PART_ROW} border-b border-r border-slate-200 last:border-r-0 dark:border-slate-700`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({
  anchor,
  itemsByDay,
  todayKey,
  loading,
}: {
  anchor: Date;
  itemsByDay: Map<string, AgendaItem[]>;
  todayKey: string;
  loading: boolean;
}) {
  const cells = useMemo(() => monthGridCells(anchor), [anchor]);

  return (
    <div
      className={
        "overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 " +
        (loading ? "opacity-60" : "")
      }
    >
      <div className="min-w-[480px]">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
          {WEEKDAY_SHORT.map((wd) => (
            <div
              key={wd}
              className="border-r border-slate-200 py-2 text-center text-[10px] font-semibold uppercase text-slate-500 last:border-r-0 dark:border-slate-700"
            >
              {wd}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const dayItems = itemsByDay.get(cell.key) ?? [];
            const isToday = cell.key === todayKey;
            return (
              <div
                key={cell.key}
                className={
                  "min-h-[5.5rem] border-b border-r border-slate-200 p-1 last:border-r-0 dark:border-slate-700 " +
                  (cell.inMonth ? "bg-white dark:bg-slate-900" : "bg-slate-50/80 dark:bg-slate-950/50")
                }
              >
                <div
                  className={
                    "mb-1 flex h-6 w-6 items-center justify-center text-[11px] font-bold " +
                    (isToday ?
                      "rounded-full bg-red-600 text-white"
                    : cell.inMonth ?
                      "text-slate-800 dark:text-slate-200"
                    : "text-slate-400")
                  }
                >
                  {cell.date.getDate()}
                </div>
                <div className="space-y-0.5">
                  {dayItems.slice(0, 3).map((it) => (
                    <AgendaEventChip key={it.id} it={it} />
                  ))}
                  {dayItems.length > 3 ?
                    <p className="text-[9px] text-slate-500">+{dayItems.length - 3} prazo(s)</p>
                  : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ChamadosAgendaPanel() {
  const [mode, setMode] = useState<ViewMode>("semana");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [sequencias, setSequencias] = useState<AgendaSequenciaTimeline[]>([]);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => rangeForMode(mode, anchor), [mode, anchor]);
  const todayKey = useMemo(() => toIsoLocal(startOfDay(new Date())), []);
  const itemsByDay = useMemo(() => groupItemsByDay(items), [items]);

  const weekDays = useMemo(() => {
    if (mode === "dia") return [startOfDay(anchor)];
    if (mode === "semana") return weekDaysFromAnchor(anchor);
    return [];
  }, [mode, anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ from: range.from, to: range.to });
      const res = await fetch(`/api/chamados/agenda?${q}`, { credentials: "same-origin" });
      const data = res.ok ? await res.json() : null;
      setItems(Array.isArray(data?.items) ? data.items : []);
      setSequencias(Array.isArray(data?.sequencias) ? data.sequencias : []);
    } catch {
      setItems([]);
      setSequencias([]);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const emptyHint = !loading && items.length === 0 && sequencias.length === 0;

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

      <AgendaSequenciaTimelines timelines={sequencias} />

      <div className="relative mt-3 max-h-[min(70vh,420px)] overflow-y-auto">
        {mode === "mes" ?
          <MonthGrid anchor={anchor} itemsByDay={itemsByDay} todayKey={todayKey} loading={loading} />
        : <TimeGrid days={weekDays} itemsByDay={itemsByDay} todayKey={todayKey} loading={loading} />}
        {loading ?
          <p className="pointer-events-none absolute left-2 top-2 text-[10px] font-medium text-slate-500">
            Carregando…
          </p>
        : null}
      </div>

      {emptyHint ?
        <p className="mt-2 text-[11px] text-slate-500">
          Nenhum prazo seu neste período — a grade continua disponível para navegar.
        </p>
      : null}
    </section>
  );
}
