"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChamadoParticipant, ChamadoView } from "@/lib/chamados/chamadoTypes";
import Link from "next/link";
import { AgendaCompromissoModal } from "@/components/chamados/AgendaCompromissoModal";

type AgendaItem = ChamadoView & {
  prazoLabel?: string;
  agendaFinalizado?: boolean;
  agendaSemPrazo?: boolean;
};

type AgendaCompromissoItem = {
  id: string;
  titulo: string;
  descricao: string;
  inicioEm: string;
  horaLabel: string;
  criadoPorEmail: string;
  criadoPorNome: string;
  participantes: string[];
  papel: "criador" | "convidado";
};

type AgendaDayEntry =
  | { kind: "chamado"; sortAt: string; data: AgendaItem }
  | { kind: "compromisso"; sortAt: string; data: AgendaCompromissoItem };

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
    const sun = addDays(mon, 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(/\./g, "");
    return {
      from: mon.toISOString(),
      to: addDays(mon, 7).toISOString(),
      title: `${fmt(mon)} – ${fmt(sun)}`,
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

function groupEntriesByDay(
  chamados: AgendaItem[],
  compromissos: AgendaCompromissoItem[],
): Map<string, AgendaDayEntry[]> {
  const map = new Map<string, AgendaDayEntry[]>();
  for (const it of chamados) {
    if (!it.prazoEntrega) continue;
    const key = prazoDayKey(it.prazoEntrega);
    const list = map.get(key) ?? [];
    list.push({ kind: "chamado", sortAt: it.prazoEntrega, data: it });
    map.set(key, list);
  }
  for (const c of compromissos) {
    const key = prazoDayKey(c.inicioEm);
    const list = map.get(key) ?? [];
    list.push({ kind: "compromisso", sortAt: c.inicioEm, data: c });
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.sortAt.localeCompare(b.sortAt));
  }
  return map;
}

type AgendaLane =
  | { kind: "sequencia"; grupoId: string }
  | { kind: "other"; id: string };

function sequenciaMinTime(seq: AgendaSequenciaTimeline): number {
  let t = Infinity;
  for (const p of seq.passos) {
    const x = new Date(p.prazoEntrega).getTime();
    if (x < t) t = x;
  }
  return t === Infinity ? 0 : t;
}

function sortSequenciasForLanes(sequencias: AgendaSequenciaTimeline[]): AgendaSequenciaTimeline[] {
  return [...sequencias].sort(
    (a, b) => sequenciaMinTime(a) - sequenciaMinTime(b) || a.grupoId.localeCompare(b.grupoId),
  );
}

function entryStableId(entry: AgendaDayEntry): string {
  return entry.kind === "chamado" ? entry.data.id : `c-${entry.data.id}`;
}

function isSequenciaEntry(entry: AgendaDayEntry): boolean {
  return entry.kind === "chamado" && Boolean(entry.data.sequenciaGrupoId);
}

function buildAgendaLanes(
  sequencias: AgendaSequenciaTimeline[],
  entriesByDay: Map<string, AgendaDayEntry[]>,
  dayKeys: string[],
): AgendaLane[] {
  const lanes: AgendaLane[] = sortSequenciasForLanes(sequencias).map((seq) => ({
    kind: "sequencia",
    grupoId: seq.grupoId,
  }));
  const orphans: { id: string; firstDayIdx: number; sortAt: string }[] = [];
  const seen = new Set<string>();
  dayKeys.forEach((dk, di) => {
    for (const entry of entriesByDay.get(dk) ?? []) {
      if (isSequenciaEntry(entry)) continue;
      const id = entryStableId(entry);
      if (seen.has(id)) continue;
      seen.add(id);
      orphans.push({ id, firstDayIdx: di, sortAt: entry.sortAt });
    }
  });
  orphans.sort((a, b) => a.firstDayIdx - b.firstDayIdx || a.sortAt.localeCompare(b.sortAt));
  for (const o of orphans) lanes.push({ kind: "other", id: o.id });
  return lanes;
}

function findEntryInLane(
  lane: AgendaLane,
  dayKey: string,
  entriesByDay: Map<string, AgendaDayEntry[]>,
): AgendaDayEntry | null {
  const list = entriesByDay.get(dayKey) ?? [];
  if (lane.kind === "sequencia") {
    return (
      list.find((e) => e.kind === "chamado" && e.data.sequenciaGrupoId === lane.grupoId) ?? null
    );
  }
  return list.find((e) => entryStableId(e) === lane.id) ?? null;
}

function sequenciaSpanMask(
  lane: AgendaLane,
  dayKeys: string[],
  entriesByDay: Map<string, AgendaDayEntry[]>,
): boolean[] | null {
  if (lane.kind !== "sequencia") return null;
  const mask = dayKeys.map((dk) => Boolean(findEntryInLane(lane, dk, entriesByDay)));
  let first = -1;
  let last = -1;
  mask.forEach((v, i) => {
    if (v) {
      if (first < 0) first = i;
      last = i;
    }
  });
  if (first < 0) return mask;
  const span = [...mask];
  for (let k = first; k <= last; k++) span[k] = true;
  return span;
}

const SEQ_ACCENT_IDS = ["teal", "amber"] as const;
type SeqAccentId = (typeof SEQ_ACCENT_IDS)[number];

function sequenciaAccentForGrupo(
  sequencias: AgendaSequenciaTimeline[],
  grupoId: string,
): SeqAccentId {
  const sorted = sortSequenciasForLanes(sequencias);
  const idx = sorted.findIndex((s) => s.grupoId === grupoId);
  return SEQ_ACCENT_IDS[idx >= 0 ? idx % SEQ_ACCENT_IDS.length : 0];
}

function sequenciaLaneAccent(
  lane: AgendaLane,
  sequencias: AgendaSequenciaTimeline[],
): SeqAccentId | null {
  return lane.kind === "sequencia" ? sequenciaAccentForGrupo(sequencias, lane.grupoId) : null;
}

const SEQ_CONNECTOR: Record<SeqAccentId, string> = {
  teal: "bg-teal-400/70",
  amber: "bg-amber-400/70",
};

const SEQ_TIMELINE_SHELL: Record<SeqAccentId, string> = {
  teal: "border-teal-300/80 bg-teal-50/90 dark:border-teal-800 dark:bg-teal-950/40",
  amber: "border-amber-300/80 bg-amber-50/90 dark:border-amber-800 dark:bg-amber-950/40",
};

const SEQ_TIMELINE_TITLE: Record<SeqAccentId, string> = {
  teal: "text-teal-950 dark:text-teal-100",
  amber: "text-amber-950 dark:text-amber-100",
};

const SEQ_TIMELINE_KICKER: Record<SeqAccentId, string> = {
  teal: "text-teal-700 dark:text-teal-300",
  amber: "text-amber-700 dark:text-amber-300",
};

const SEQ_EVENT_CHIP: Record<SeqAccentId, string> = {
  teal: "border-teal-300 bg-teal-50 text-teal-950 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/80 dark:text-teal-100 dark:hover:bg-teal-900",
  amber:
    "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-100 dark:hover:bg-amber-900",
};

const SEQ_STEP_ACTIVE: Record<SeqAccentId, string> = {
  teal: "border-teal-600 bg-teal-600 font-bold text-white shadow-sm",
  amber: "border-amber-600 bg-amber-600 font-bold text-white shadow-sm",
};

const SEQ_STEP_DONE: Record<SeqAccentId, string> = {
  teal: "border-teal-200 bg-white/60 text-teal-800 opacity-80 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-200",
  amber:
    "border-amber-200 bg-white/60 text-amber-900 opacity-80 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
};

const SEQ_STEP_IDLE: Record<SeqAccentId, string> = {
  teal: "border-teal-200 bg-white text-teal-900 dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-100",
  amber: "border-amber-200 bg-white text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100",
};

function AgendaLaneSlot({
  entry,
  lane,
  dayIdx,
  spanMask,
  sequencias,
  onDeleteCompromisso,
  compact,
}: {
  entry: AgendaDayEntry | null;
  lane: AgendaLane;
  dayIdx: number;
  spanMask: boolean[] | null;
  sequencias: AgendaSequenciaTimeline[];
  onDeleteCompromisso?: (id: string) => void;
  compact?: boolean;
}) {
  const laneAccent = sequenciaLaneAccent(lane, sequencias);
  const connector = laneAccent ? SEQ_CONNECTOR[laneAccent] : "bg-emerald-400/60";
  const inSpan = lane.kind === "sequencia" && spanMask?.[dayIdx];
  if (!entry) {
    if (inSpan) {
      return (
        <div
          className={compact ? "relative min-h-[14px]" : "relative min-h-[26px]"}
          aria-hidden
        >
          <span className={`absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded ${connector}`} />
        </div>
      );
    }
    return <div className={compact ? "min-h-[14px]" : "min-h-[6px]"} aria-hidden />;
  }
  const bridgeL = Boolean(inSpan && dayIdx > 0 && spanMask?.[dayIdx - 1]);
  const bridgeR = Boolean(inSpan && spanMask && dayIdx < spanMask.length - 1 && spanMask[dayIdx + 1]);
  return (
    <div
      className={
        "relative " +
        (compact ? "min-h-[14px]" : "min-h-[26px]") +
        (lane.kind === "sequencia" ? " agenda-lane-seq" : "")
      }
    >
      {bridgeL ?
        <span
          className={`pointer-events-none absolute -left-0.5 top-1/2 z-0 h-0.5 w-1 -translate-y-1/2 ${connector}`}
          aria-hidden
        />
      : null}
      {bridgeR ?
        <span
          className={`pointer-events-none absolute -right-0.5 top-1/2 z-0 h-0.5 w-1 -translate-y-1/2 ${connector}`}
          aria-hidden
        />
      : null}
      <div className="relative z-[1]">
        <AgendaDayChip
          entry={entry}
          sequencias={sequencias}
          onDeleteCompromisso={onDeleteCompromisso}
        />
      </div>
    </div>
  );
}

function AgendaCompromissoChip({
  c,
  onDelete,
}: {
  c: AgendaCompromissoItem;
  onDelete?: () => void;
}) {
  const mine = c.papel === "criador";
  return (
    <div
      className={
        "relative rounded-md border px-1.5 py-1 text-[10px] leading-tight " +
        (mine ?
          "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/70 dark:text-sky-100"
        : "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100")
      }
      title={c.descricao || c.titulo}
    >
      {onDelete ?
        <button
          type="button"
          className="absolute right-0.5 top-0.5 rounded px-1 text-[10px] leading-none opacity-60 hover:opacity-100"
          aria-label="Excluir compromisso"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          ×
        </button>
      : null}
      <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide opacity-90">
        {mine ? "Meu compromisso" : `Convite · ${c.criadoPorNome}`}
      </span>
      {c.horaLabel ?
        <span className="font-semibold tabular-nums">{c.horaLabel}</span>
      : null}
      <span className="line-clamp-2 font-semibold">{c.titulo}</span>
    </div>
  );
}

function AgendaDayChip({
  entry,
  sequencias,
  onDeleteCompromisso,
}: {
  entry: AgendaDayEntry;
  sequencias: AgendaSequenciaTimeline[];
  onDeleteCompromisso?: (id: string) => void;
}) {
  if (entry.kind === "chamado") {
    const seqAccent =
      entry.data.sequenciaGrupoId ?
        sequenciaAccentForGrupo(sequencias, entry.data.sequenciaGrupoId)
      : undefined;
    return <AgendaEventChip it={entry.data} seqAccent={seqAccent} />;
  }
  return (
    <AgendaCompromissoChip
      c={entry.data}
      onDelete={
        entry.data.papel === "criador" && onDeleteCompromisso ?
          () => onDeleteCompromisso(entry.data.id)
        : undefined
      }
    />
  );
}

function AgendaEventChip({ it, seqAccent }: { it: AgendaItem; seqAccent?: SeqAccentId }) {
  const seq = Boolean(it.sequenciaGrupoId);
  const finalizado = Boolean(it.agendaFinalizado || (seq && it.status === "fechado"));
  return (
    <Link
      href={`/chamados/kanban?chamado=${encodeURIComponent(it.id)}`}
      className={
        "block rounded-md border px-1.5 py-1 text-[10px] leading-tight " +
        (finalizado ?
          "border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:bg-slate-800"
        : seq && seqAccent ?
          SEQ_EVENT_CHIP[seqAccent]
        : seq ?
          SEQ_EVENT_CHIP.teal
        : "border-violet-200 bg-violet-50 text-violet-950 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/80 dark:text-violet-100 dark:hover:bg-violet-900")
      }
      title={it.titulo}
    >
      {finalizado ?
        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide text-slate-400">
          Finalizado
        </span>
      : null}
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
  const sorted = sortSequenciasForLanes(timelines);
  return (
    <div className="mb-3 space-y-2">
      {sorted.map((seq) => {
        const accent = sequenciaAccentForGrupo(timelines, seq.grupoId);
        return (
        <div
          key={seq.grupoId}
          className={`rounded-xl border p-3 ${SEQ_TIMELINE_SHELL[accent]}`}
        >
          <p className={`text-xs font-bold ${SEQ_TIMELINE_TITLE[accent]}`}>
            {seq.titulo}
            <span className={`ml-1 text-[10px] font-bold ${SEQ_TIMELINE_KICKER[accent]}`}>
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
                    <span
                      className={
                        "hidden shrink-0 sm:inline " +
                        (accent === "amber" ? "text-amber-400" : "text-teal-400")
                      }
                      aria-hidden
                    >
                      →
                    </span>
                  : null}
                  <Link
                    href={`/chamados/kanban?chamado=${encodeURIComponent(p.chamadoId)}`}
                    className={
                      "min-w-[4.5rem] flex-1 rounded-lg border px-2 py-1.5 text-center text-[10px] leading-tight transition " +
                      (active ?
                        SEQ_STEP_ACTIVE[accent]
                      : done ?
                        SEQ_STEP_DONE[accent]
                      : SEQ_STEP_IDLE[accent])
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
        );
      })}
    </div>
  );
}

function TimeGrid({
  days,
  entriesByDay,
  sequencias,
  todayKey,
  loading,
  onDeleteCompromisso,
  expanded,
}: {
  days: Date[];
  entriesByDay: Map<string, AgendaDayEntry[]>;
  sequencias: AgendaSequenciaTimeline[];
  todayKey: string;
  loading: boolean;
  onDeleteCompromisso?: (id: string) => void;
  expanded?: boolean;
}) {
  const colCount = days.length;
  const gridCols = `3rem repeat(${colCount}, minmax(0, 1fr))`;
  const partRow = expanded ? "min-h-[5.5rem]" : PART_ROW;
  const dayKeys = useMemo(() => days.map((d) => toIsoLocal(d)), [days]);
  const lanes = useMemo(
    () => buildAgendaLanes(sequencias, entriesByDay, dayKeys),
    [sequencias, entriesByDay, dayKeys],
  );
  const spanByLane = useMemo(
    () => lanes.map((lane) => sequenciaSpanMask(lane, dayKeys, entriesByDay)),
    [lanes, dayKeys, entriesByDay],
  );
  const laneRows = lanes.length > 0 ? lanes : null;

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

        {(laneRows ?? [{ kind: "other" as const, id: "__empty" }]).map((lane, laneIdx) => (
          <div
            key={lane.kind === "sequencia" ? lane.grupoId : lane.id + String(laneIdx)}
            className="grid border-b border-slate-200 dark:border-slate-700"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="flex items-start justify-end border-r border-slate-200 px-1 py-2 text-[9px] font-semibold text-slate-400 dark:border-slate-700">
              {laneIdx === 0 ? "Eventos" : ""}
            </div>
            {days.map((day, dayIdx) => {
              const key = toIsoLocal(day);
              const placeholder = lane.kind === "other" && lane.id === "__empty";
              const entry =
                laneRows && !placeholder ? findEntryInLane(lane, key, entriesByDay) : null;
              const spanMask = laneRows ? spanByLane[laneIdx] : null;
              return (
                <div
                  key={`prazo-${key}-${laneIdx}`}
                  className="min-h-[1.75rem] border-r border-slate-200 p-0.5 last:border-r-0 dark:border-slate-700"
                >
                  {laneRows && !placeholder ?
                    <AgendaLaneSlot
                      entry={entry}
                      lane={lane}
                      dayIdx={dayIdx}
                      spanMask={spanMask}
                      sequencias={sequencias}
                      onDeleteCompromisso={onDeleteCompromisso}
                    />
                  : null}
                </div>
              );
            })}
          </div>
        ))}

        <div className="grid" style={{ gridTemplateColumns: gridCols }}>
          {DAY_PARTS.map((part) => (
            <div key={part.id} className="contents">
              <div
                className={
                  `${partRow} flex items-start justify-end border-b border-r border-slate-200 px-1 pt-2 text-right text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400`
                }
              >
                {part.label}
              </div>
              {days.map((day) => {
                const key = `${toIsoLocal(day)}-${part.id}`;
                return (
                  <div
                    key={key}
                    className={`${partRow} border-b border-r border-slate-200 last:border-r-0 dark:border-slate-700`}
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
  entriesByDay,
  sequencias,
  todayKey,
  loading,
  onDeleteCompromisso,
  maxLanes = 3,
}: {
  anchor: Date;
  entriesByDay: Map<string, AgendaDayEntry[]>;
  sequencias: AgendaSequenciaTimeline[];
  todayKey: string;
  loading: boolean;
  onDeleteCompromisso?: (id: string) => void;
  maxLanes?: number;
}) {
  const cells = useMemo(() => monthGridCells(anchor), [anchor]);
  const weeks = useMemo(() => {
    const rows: { date: Date; inMonth: boolean; key: string }[][] = [];
    for (let w = 0; w < 6; w++) rows.push(cells.slice(w * 7, w * 7 + 7));
    return rows;
  }, [cells]);

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
        <div>
          {weeks.map((week, weekIdx) => {
            const weekKeys = week.map((c) => c.key);
            const lanes = buildAgendaLanes(sequencias, entriesByDay, weekKeys);
            const spanByLane = lanes.map((lane) => sequenciaSpanMask(lane, weekKeys, entriesByDay));
            return (
              <div key={weekIdx} className="grid grid-cols-7">
            {week.map((cell, dayIdx) => {
              const isToday = cell.key === todayKey;
              let extra = 0;
              for (let li = maxLanes; li < lanes.length; li++) {
                if (findEntryInLane(lanes[li], cell.key, entriesByDay)) extra++;
              }
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
                    {lanes.slice(0, maxLanes).map((lane, laneIdx) => (
                      <AgendaLaneSlot
                        key={lane.kind === "sequencia" ? lane.grupoId : lane.id}
                        entry={findEntryInLane(lane, cell.key, entriesByDay)}
                        lane={lane}
                        dayIdx={dayIdx}
                        spanMask={spanByLane[laneIdx]}
                        sequencias={sequencias}
                        onDeleteCompromisso={onDeleteCompromisso}
                        compact
                      />
                    ))}
                    {extra > 0 ?
                      <p className="text-[9px] text-slate-500">+{extra} evento(s)</p>
                    : null}
                  </div>
                </div>
              );
            })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ChamadosAgendaPanel({ variant = "dashboard" }: { variant?: "dashboard" | "page" }) {
  const isPage = variant === "page";
  const [mode, setMode] = useState<ViewMode>(isPage ? "mes" : "semana");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [semPrazo, setSemPrazo] = useState<AgendaItem[]>([]);
  const [compromissos, setCompromissos] = useState<AgendaCompromissoItem[]>([]);
  const [sequencias, setSequencias] = useState<AgendaSequenciaTimeline[]>([]);
  const [showFinalizados, setShowFinalizados] = useState(!isPage);
  const [loading, setLoading] = useState(true);
  const [compromissoOpen, setCompromissoOpen] = useState(false);
  const [compromissoBusy, setCompromissoBusy] = useState(false);
  const [participants, setParticipants] = useState<ChamadoParticipant[]>([]);
  const [viewerEmail, setViewerEmail] = useState("");

  const range = useMemo(() => rangeForMode(mode, anchor), [mode, anchor]);
  const todayKey = useMemo(() => toIsoLocal(startOfDay(new Date())), []);
  const entriesByDay = useMemo(
    () => groupEntriesByDay(items, compromissos),
    [items, compromissos],
  );

  const weekDays = useMemo(() => {
    if (mode === "dia") return [startOfDay(anchor)];
    if (mode === "semana") return weekDaysFromAnchor(anchor);
    return [];
  }, [mode, anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        from: range.from,
        to: range.to,
        includeFinalizados: showFinalizados ? "1" : "0",
      });
      const res = await fetch(`/api/chamados/agenda?${q}`, { credentials: "same-origin" });
      const data = res.ok ? await res.json() : null;
      setItems(Array.isArray(data?.items) ? data.items : []);
      setSemPrazo(Array.isArray(data?.semPrazo) ? data.semPrazo : []);
      setSequencias(Array.isArray(data?.sequencias) ? data.sequencias : []);
      setCompromissos(Array.isArray(data?.compromissos) ? data.compromissos : []);
    } catch {
      setItems([]);
      setSemPrazo([]);
      setSequencias([]);
      setCompromissos([]);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, showFinalizados]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetch("/api/chamados/participants", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = Array.isArray(d?.participants) ? d.participants : [];
        setParticipants(list);
      })
      .catch(() => {});
    void fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.email === "string") setViewerEmail(d.email);
      })
      .catch(() => {});
  }, []);

  async function criarCompromisso(payload: {
    titulo: string;
    descricao: string;
    inicioEm: string;
    participantes: string[];
  }) {
    setCompromissoBusy(true);
    try {
      const res = await fetch("/api/chamados/agenda/compromissos", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("fail");
      setCompromissoOpen(false);
      await load();
    } finally {
      setCompromissoBusy(false);
    }
  }

  async function excluirCompromisso(id: string) {
    if (!confirm("Excluir este compromisso?")) return;
    await fetch(`/api/chamados/agenda/compromissos/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    await load();
  }

  const emptyHint =
    !loading &&
    items.length === 0 &&
    semPrazo.length === 0 &&
    sequencias.length === 0 &&
    compromissos.length === 0;

  return (
    <section
      className={
        "flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 " +
        (isPage ? "min-h-[calc(100vh-11rem)] flex-1" : "mb-6")
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {isPage ?
            <p className="text-base font-bold capitalize text-slate-900 dark:text-white">{range.title}</p>
          : <>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Agenda — chamados e compromissos
              </h2>
              <p className="text-[11px] text-slate-500 capitalize">{range.title}</p>
            </>
          }
          <p className="text-[10px] text-slate-400">
            <span className="text-sky-600 dark:text-sky-400">■</span> seu compromisso ·{" "}
            <span className="text-amber-600 dark:text-amber-400">■</span> convite de outra pessoa
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            className="rounded-lg bg-sky-600 px-2.5 py-0.5 text-[11px] font-bold text-white"
            onClick={() => setCompromissoOpen(true)}
          >
            + Compromisso
          </button>
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

      <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
        <input
          type="checkbox"
          checked={showFinalizados}
          onChange={(e) => setShowFinalizados(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-slate-300"
        />
        Mostrar chamados finalizados na grade
      </label>

      {semPrazo.length > 0 ?
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-2 dark:border-slate-600">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Chamados antigos sem data — defina a data limite no chamado
          </p>
          <div className="flex flex-wrap gap-1">
            {semPrazo.map((it) => (
              <AgendaEventChip
                key={it.id}
                it={it}
                seqAccent={
                  it.sequenciaGrupoId ?
                    sequenciaAccentForGrupo(sequencias, it.sequenciaGrupoId)
                  : undefined
                }
              />
            ))}
          </div>
        </div>
      : null}

      <AgendaSequenciaTimelines timelines={sequencias} />

      <div
        className={
          "relative mt-3 min-h-0 flex-1 overflow-y-auto " +
          (isPage ? "max-h-none" : "max-h-[min(70vh,420px)]")
        }
      >
        {mode === "mes" ?
          <MonthGrid
            anchor={anchor}
            entriesByDay={entriesByDay}
            sequencias={sequencias}
            todayKey={todayKey}
            loading={loading}
            onDeleteCompromisso={excluirCompromisso}
            maxLanes={isPage ? 8 : 3}
          />
        : <TimeGrid
            days={weekDays}
            entriesByDay={entriesByDay}
            sequencias={sequencias}
            todayKey={todayKey}
            loading={loading}
            onDeleteCompromisso={excluirCompromisso}
            expanded={isPage}
          />}
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

      <AgendaCompromissoModal
        open={compromissoOpen}
        busy={compromissoBusy}
        defaultDate={toIsoLocal(anchor)}
        participants={participants}
        viewerEmail={viewerEmail}
        onClose={() => setCompromissoOpen(false)}
        onSubmit={(p) => void criarCompromisso(p)}
      />
    </section>
  );
}
