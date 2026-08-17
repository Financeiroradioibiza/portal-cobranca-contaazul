"use client";

import { useCallback, useEffect, useState } from "react";
import { DOW } from "@/components/criacao/CronogramaAlvoBadges";
import type { AgendamentoRow } from "@/lib/criacao/agendamentoService";
import type { CronogramaShuffleRow } from "@/lib/criacao/cronogramaShuffleService";
import { MESES_CRONOGRAMA } from "@/lib/criacao/cronogramaShuffleExpand";

const CRONOGRAMA_HORARIO_PRESETS = [
  { label: "Dia todo", hIni: "00:00", hFim: "23:59" },
  { label: "06:00 – 18:00", hIni: "06:00", hFim: "18:00" },
  { label: "08:00 – 22:00", hIni: "08:00", hFim: "22:00" },
  { label: "18:00 – 23:59", hIni: "18:00", hFim: "23:59" },
] as const;

function TimerBadge({ s }: { s: CronogramaShuffleRow }) {
  if (s.expirado) {
    return (
      <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        Expirado — crie novo Shuffle
      </span>
    );
  }
  const label =
    s.mesesRestantes <= 1 ?
      "Resta 1 mês"
    : `Restam ${s.mesesRestantes} meses`;
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        s.alerta ?
          "bg-red-100 text-red-800 ring-1 ring-red-300 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-800"
        : "bg-indigo-100 text-indigo-900 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-200 dark:ring-indigo-800"
      }`}
      title={`Válido até ${s.expiraEm}. Timer informativo — não altera o player.`}
    >
      {s.alerta ? `⚠ ${label}` : label} · até {s.expiraEm}
    </span>
  );
}

export function CronogramaShufflePanel({
  programacaoId,
  pastas,
  onAgendamentosChange,
  onEdit,
}: {
  programacaoId: string;
  pastas: { id: string; nome: string }[];
  onAgendamentosChange: (next: AgendamentoRow[]) => void;
  onEdit?: () => void | Promise<void>;
}) {
  const [shuffles, setShuffles] = useState<CronogramaShuffleRow[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pastaId, setPastaId] = useState("");
  const [meses, setMeses] = useState<Set<number>>(new Set());
  const [dias, setDias] = useState<Set<number>>(new Set());
  const [hIni, setHIni] = useState("00:00");
  const [hFim, setHFim] = useState("23:59");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/criacao/programacoes/${programacaoId}/cronograma-shuffle`);
      if (res.ok) {
        setShuffles(((await res.json()) as { shuffles: CronogramaShuffleRow[] }).shuffles);
      }
    } catch {
      /* silencioso */
    }
  }, [programacaoId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function criarShuffle() {
    if (!pastaId || meses.size === 0 || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await onEdit?.();
      const res = await fetch(`/api/criacao/programacoes/${programacaoId}/cronograma-shuffle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pastaId,
          meses: Array.from(meses).sort((a, b) => a - b),
          diasSemana: Array.from(dias).sort((a, b) => a - b).join(","),
          horaInicio: hIni,
          horaFim: hFim,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        regrasCriadas?: number;
        expiraEm?: string;
        agendamentos?: AgendamentoRow[];
      };
      if (!res.ok) {
        setMsg(data.error ?? "Erro ao criar Shuffle");
        return;
      }
      onAgendamentosChange(data.agendamentos ?? []);
      setMsg(
        `${data.regrasCriadas ?? 0} regra(s) criada(s) · timer até ${data.expiraEm ?? "—"}`,
      );
      setOpen(false);
      setMeses(new Set());
      setDias(new Set());
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
            Cronograma Shuffle
          </h2>
          <p className="mt-0.5 text-[10px] text-slate-500">
            Cria regras de cronograma normais por mês (2 anos). Timer só informativo no portal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={pastas.length === 0}
          className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-40 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100"
        >
          {open ? "Fechar" : "+ Shuffle"}
        </button>
      </div>

      {open ?
        <div className="mb-3 rounded-xl border border-indigo-200 bg-white p-4 dark:border-indigo-900 dark:bg-slate-900">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Pasta</span>
              <select
                value={pastaId}
                onChange={(e) => setPastaId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">Selecione…</option>
                {pastas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
            <div className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Meses (2 anos à frente)</span>
              <div className="flex flex-wrap gap-1">
                {MESES_CRONOGRAMA.map((m) => (
                  <button
                    key={m.n}
                    type="button"
                    onClick={() =>
                      setMeses((prev) => {
                        const n = new Set(prev);
                        if (n.has(m.n)) n.delete(m.n);
                        else n.add(m.n);
                        return n;
                      })
                    }
                    className={`h-8 min-w-[2.25rem] rounded px-1.5 text-xs font-semibold ${
                      meses.has(m.n) ?
                        "bg-indigo-700 text-white dark:bg-indigo-300 dark:text-indigo-950"
                      : "border border-slate-200 text-slate-500 dark:border-slate-700"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Dias da semana</span>
              <div className="flex flex-wrap gap-1">
                {DOW.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setDias((prev) => {
                        const n = new Set(prev);
                        if (n.has(i)) n.delete(i);
                        else n.add(i);
                        return n;
                      })
                    }
                    className={`h-8 w-9 rounded text-xs font-semibold ${
                      dias.has(i) ?
                        "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "border border-slate-200 text-slate-500 dark:border-slate-700"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-[10px] text-slate-400">Nenhum marcado = todos os dias.</div>
            </div>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Horário</span>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={hIni}
                  onChange={(e) => setHIni(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
                <span className="text-slate-400">até</span>
                <input
                  type="time"
                  value={hFim}
                  onChange={(e) => setHFim(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CRONOGRAMA_HORARIO_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setHIni(p.hIni);
                      setHFim(p.hFim);
                    }}
                    className="rounded-full border border-slate-200 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void criarShuffle()}
              disabled={busy || !pastaId || meses.size === 0}
              className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-indigo-300 dark:text-indigo-950"
            >
              {busy ? "Gerando regras…" : "Criar Shuffle (2 anos)"}
            </button>
            {msg ?
              <span className="text-xs text-emerald-600 dark:text-emerald-400">{msg}</span>
            : null}
          </div>
        </div>
      : null}

      {shuffles.length > 0 ?
        <div className="space-y-2">
          {shuffles.map((s) => (
            <div
              key={s.id}
              className={`rounded-xl border px-4 py-3 text-sm ${
                s.alerta ?
                  "border-red-300 bg-red-50/80 dark:border-red-900 dark:bg-red-950/20"
                : s.expirado ?
                  "border-slate-200 bg-slate-50 opacity-70 dark:border-slate-800 dark:bg-slate-900/50"
                : "border-indigo-200 bg-indigo-50/50 dark:border-indigo-900 dark:bg-indigo-950/20"
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded bg-indigo-200/80 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-100">
                  Shuffle
                </span>
                <span className="font-semibold">{s.pastaNome}</span>
                <span className="text-slate-500">{s.mesesLabels}</span>
                <span className="tabular-nums text-slate-500">
                  {s.horaInicio}–{s.horaFim}
                </span>
                <span className="text-[10px] text-slate-400">{s.regrasCount} regra(s)</span>
                <TimerBadge s={s} />
              </div>
            </div>
          ))}
        </div>
      : null}
    </div>
  );
}
