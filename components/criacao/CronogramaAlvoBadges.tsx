import type { AgendamentoRow } from "@/lib/criacao/agendamentoService";

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export { DOW };

export function diasLabel(csv: string): string {
  if (!csv.trim()) return "todos os dias";
  const ds = csv.split(",").map((n) => DOW[Number(n)] ?? "").filter(Boolean);
  return ds.join(", ");
}

/** Rótulo do período de datas — dataFim null após dataInicio = sem fim. */
export function formatPeriodoAgendamento(dataInicio: string | null, dataFim: string | null): string | null {
  if (!dataInicio && !dataFim) return null;
  if (dataInicio && !dataFim) return `desde ${dataInicio} (sem fim)`;
  if (!dataInicio && dataFim) return `até ${dataFim}`;
  return `${dataInicio} → ${dataFim}`;
}

export function resumoAgendamento(a: AgendamentoRow): string {
  const parts = [diasLabel(a.diasSemana), `${a.horaInicio}–${a.horaFim}`];
  const periodo = formatPeriodoAgendamento(a.dataInicio, a.dataFim);
  if (periodo) parts.push(periodo);
  if (a.frequenciaMin) parts.push(`a cada ${a.frequenciaMin} min`);
  if (a.frequenciaMusicas) {
    parts.push(`a cada ${a.frequenciaMusicas} música${a.frequenciaMusicas === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

export type CronogramaAlvoTipo = "pasta" | "vinheta" | "vinheta_pasta";

function agendamentosDoAlvo(
  ags: AgendamentoRow[],
  alvoTipo: CronogramaAlvoTipo,
  alvoId: string,
): AgendamentoRow[] {
  return ags.filter((a) => a.alvoTipo === alvoTipo && a.alvoId === alvoId);
}

/** Badge ao lado da pasta/vinheta — «Tocar sempre» (pasta) ou cronograma. */
export type VinhetaHorarioFixoBadgeSlot = {
  tipo: "abertura" | "encerramento";
  hora: string;
  ativo: boolean;
  vinhetaId: string | null;
};

function horarioFixoBadgeLabel(tipo: VinhetaHorarioFixoBadgeSlot["tipo"], hora: string): string {
  return tipo === "abertura" ? `Abertura · ${hora}` : `Encerramento · ${hora}`;
}

export function CronogramaAlvoBadges({
  ags,
  alvoTipo,
  alvoId,
  vinhetaHorarioFixo,
}: {
  ags: AgendamentoRow[];
  alvoTipo: CronogramaAlvoTipo;
  alvoId: string;
  /** Abertura/encerramento (horário fixo) — fora do cronograma VP/VA. */
  vinhetaHorarioFixo?: VinhetaHorarioFixoBadgeSlot[];
}) {
  const rules = agendamentosDoAlvo(ags, alvoTipo, alvoId);
  const active = rules.filter((a) => a.ativo);
  const paused = rules.filter((a) => !a.ativo);

  const fixoSlot =
    alvoTipo === "vinheta" && vinhetaHorarioFixo?.length ?
      vinhetaHorarioFixo.find((s) => s.ativo && s.vinhetaId === alvoId)
    : null;

  if (rules.length === 0) {
    if (fixoSlot) {
      return (
        <span
          className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-900 ring-1 ring-violet-500/30 dark:text-violet-200"
          title="Horário fixo diário (Brasil) — abertura ou encerramento"
        >
          {horarioFixoBadgeLabel(fixoSlot.tipo, fixoSlot.hora)}
        </span>
      );
    }
    if (alvoTipo === "vinheta" || alvoTipo === "vinheta_pasta") {
      return (
        <span
          className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-500/30 dark:text-amber-200"
          title="Sem horário automático; após publicar, o cliente ainda pode selecionar esta vinheta no player"
        >
          Sem cronograma
        </span>
      );
    }
    return (
      <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 ring-1 ring-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-200">
        TOCAR SEMPRE
      </span>
    );
  }

  if (active.length === 0) {
    return (
      <span className="rounded-md bg-slate-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 ring-1 ring-slate-400/30 dark:text-slate-300">
        Cronograma pausado
      </span>
    );
  }

  const chipClass =
    alvoTipo === "vinheta" || alvoTipo === "vinheta_pasta" ?
      "rounded-md bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-900 ring-1 ring-fuchsia-500/30 dark:text-fuchsia-200"
    : "rounded-md bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-900 ring-1 ring-sky-500/30 dark:text-sky-200";

  return (
    <span className="flex flex-wrap items-center gap-1">
      {fixoSlot ?
        <span
          className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-900 ring-1 ring-violet-500/30 dark:text-violet-200"
          title="Horário fixo diário (Brasil)"
        >
          {horarioFixoBadgeLabel(fixoSlot.tipo, fixoSlot.hora)}
        </span>
      : null}
      {active.map((a) => (
        <span key={a.id} className={chipClass} title={resumoAgendamento(a)}>
          {resumoAgendamento(a)}
        </span>
      ))}
      {paused.length > 0 ?
        <span className="text-[10px] text-slate-400">+{paused.length} pausada{paused.length === 1 ? "" : "s"}</span>
      : null}
    </span>
  );
}
