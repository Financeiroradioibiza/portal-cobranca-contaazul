import type { AgendamentoRow } from "@/lib/criacao/agendamentoService";

const TZ = "America/Sao_Paulo";

function diasFromCsv(csv: string): number[] {
  const raw = (csv || "").trim();
  if (!raw) return [0, 1, 2, 3, 4, 5, 6];
  return raw
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

function horaToMinutes(h: string): number {
  const [hh, mm] = h.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

function nowBrParts(now: Date): { dow: number; minutes: number; dateKey: string } {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = parseInt(get("hour"), 10);
  const minute = parseInt(get("minute"), 10);
  const weekday = get("weekday").toLowerCase();
  const dowMap: Record<string, number> = {
    dom: 0,
    seg: 1,
    ter: 2,
    qua: 3,
    qui: 4,
    sex: 5,
    sáb: 6,
    sab: 6,
  };
  const dow = dowMap[weekday.slice(0, 3)] ?? now.getDay();
  return {
    dow,
    minutes: hour * 60 + minute,
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

function agendamentoAtivoNow(ag: AgendamentoRow, now: Date): boolean {
  if (!ag.ativo || ag.alvoTipo !== "pasta") return false;
  const { dow, minutes, dateKey } = nowBrParts(now);
  if (!diasFromCsv(ag.diasSemana).includes(dow)) return false;
  if (ag.dataInicio && dateKey < ag.dataInicio) return false;
  if (ag.dataFim && dateKey > ag.dataFim) return false;
  const ini = horaToMinutes(ag.horaInicio);
  let fim = horaToMinutes(ag.horaFim);
  if (fim <= ini) fim += 24 * 60;
  let m = minutes;
  if (m < ini && fim > 24 * 60) m += 24 * 60;
  return m >= ini && m < fim;
}

/** Pasta teórica do cronograma na hora atual (maior prioridade). */
export function resolveEstiloAgora(
  agendamentos: AgendamentoRow[],
  now = new Date(),
): string | null {
  const ativos = agendamentos
    .filter((a) => agendamentoAtivoNow(a, now))
    .sort((a, b) => b.prioridade - a.prioridade);
  return ativos[0]?.alvoNome ?? null;
}

export type SemanaBloco = {
  dia: number;
  diaLabel: string;
  horaInicio: string;
  horaFim: string;
  pastaNome: string;
};

const DOW_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Blocos para gráfico semanal (cronograma teórico). */
export function buildSemanaBlocos(agendamentos: AgendamentoRow[]): SemanaBloco[] {
  const out: SemanaBloco[] = [];
  for (const ag of agendamentos) {
    if (!ag.ativo || ag.alvoTipo !== "pasta") continue;
    const dias = diasFromCsv(ag.diasSemana);
    for (const dia of dias) {
      out.push({
        dia,
        diaLabel: DOW_LABEL[dia] ?? String(dia),
        horaInicio: ag.horaInicio,
        horaFim: ag.horaFim,
        pastaNome: ag.alvoNome,
      });
    }
  }
  return out.sort((a, b) => a.dia - b.dia || a.horaInicio.localeCompare(b.horaInicio));
}
