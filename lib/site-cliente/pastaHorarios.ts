import type { AgendamentoRow } from "@/lib/criacao/agendamentoService";

const DOW_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DOW_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export type PastaHorarioView = {
  diasLabel: string;
  horarioLabel: string;
  tocandoSempre: boolean;
};

function diasFromCsv(csv: string): number[] {
  const raw = (csv || "").trim();
  if (!raw) return [0, 1, 2, 3, 4, 5, 6];
  return raw
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

function formatDiasLabel(csv: string): string {
  const dias = diasFromCsv(csv);
  if (dias.length >= 7) return "Todos os dias";
  if (dias.length === 0) return "—";
  return dias.map((d) => DOW_SHORT[d] ?? String(d)).join(", ");
}

export function isAgendamentoTocandoSempre(ag: AgendamentoRow): boolean {
  const dias = diasFromCsv(ag.diasSemana);
  const allDays = dias.length >= 7;
  const fullDay =
    ag.horaInicio === "00:00" &&
    (ag.horaFim === "23:59" || ag.horaFim === "24:00" || ag.horaFim === "00:00");
  return allDays && fullDay;
}

function formatHorarioLabel(ag: AgendamentoRow): string {
  if (isAgendamentoTocandoSempre(ag)) return "Tocando sempre";
  return `${ag.horaInicio} – ${ag.horaFim}`;
}

/** Horários de agenda para uma pasta (pode haver mais de um bloco). */
export function horariosParaPasta(
  pastaNome: string,
  agendamentos: AgendamentoRow[],
  selecionavel = false,
): PastaHorarioView[] {
  const slots = agendamentos.filter(
    (a) => a.ativo && a.alvoTipo === "pasta" && a.alvoNome === pastaNome,
  );
  if (slots.length === 0) {
    return [
      {
        diasLabel: "—",
        horarioLabel: selecionavel ? "Pasta Selecionável" : "Sem horário na agenda",
        tocandoSempre: false,
      },
    ];
  }
  return slots.map((ag) => ({
    diasLabel: formatDiasLabel(ag.diasSemana),
    horarioLabel: formatHorarioLabel(ag),
    tocandoSempre: isAgendamentoTocandoSempre(ag),
  }));
}

export { DOW_FULL };
