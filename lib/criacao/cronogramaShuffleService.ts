import { prisma } from "@/lib/prisma";
import { createAgendamento } from "@/lib/criacao/agendamentoService";
import {
  CRONOGRAMA_SHUFFLE_ALERTA_MESES,
  CRONOGRAMA_SHUFFLE_ANOS,
  addYearsYmd,
  expandShuffleMonthPeriods,
  mesesCsvFromNumbers,
  mesesLabelsFromCsv,
  mesesRestantesAte,
  shuffleExpirado,
  todayBrYmd,
} from "@/lib/criacao/cronogramaShuffleExpand";

export type CronogramaShuffleRow = {
  id: string;
  pastaId: string;
  pastaNome: string;
  meses: string;
  mesesLabels: string;
  diasSemana: string;
  horaInicio: string;
  horaFim: string;
  criadoEm: string;
  expiraEm: string;
  regrasCount: number;
  mesesRestantes: number;
  alerta: boolean;
  expirado: boolean;
};

function parseMesesInput(v: unknown): number[] {
  if (Array.isArray(v)) {
    return v.map((x) => parseInt(String(x), 10)).filter((n) => n >= 1 && n <= 12);
  }
  if (typeof v === "string") {
    return v
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => n >= 1 && n <= 12);
  }
  return [];
}

function mapShuffleRow(
  s: {
    id: string;
    pastaId: string;
    meses: string;
    diasSemana: string;
    horaInicio: string;
    horaFim: string;
    criadoEm: Date;
    expiraEm: Date;
    agendamentoIds: string[];
    pasta: { nome: string };
  },
  now = new Date(),
): CronogramaShuffleRow {
  const expiraEm = s.expiraEm.toISOString().slice(0, 10);
  const mesesRestantes = mesesRestantesAte(expiraEm, now);
  const expirado = shuffleExpirado(expiraEm, now);
  return {
    id: s.id,
    pastaId: s.pastaId,
    pastaNome: s.pasta.nome,
    meses: s.meses,
    mesesLabels: mesesLabelsFromCsv(s.meses),
    diasSemana: s.diasSemana,
    horaInicio: s.horaInicio,
    horaFim: s.horaFim,
    criadoEm: s.criadoEm.toISOString().slice(0, 10),
    expiraEm,
    regrasCount: s.agendamentoIds.length,
    mesesRestantes,
    alerta: !expirado && mesesRestantes <= CRONOGRAMA_SHUFFLE_ALERTA_MESES,
    expirado,
  };
}

export async function listCronogramaShuffles(programacaoId: string): Promise<CronogramaShuffleRow[]> {
  const rows = await prisma.cronogramaShuffle.findMany({
    where: { programacaoId },
    orderBy: [{ expiraEm: "asc" }, { criadoEm: "desc" }],
    include: { pasta: { select: { nome: true } } },
  });
  return rows.map((s) => mapShuffleRow(s));
}

export async function createCronogramaShuffle(
  programacaoId: string,
  input: {
    pastaId?: string;
    meses?: unknown;
    diasSemana?: string;
    horaInicio?: string;
    horaFim?: string;
    frequenciaMusicas?: number | null;
  },
): Promise<{ shuffleId: string; regrasCriadas: number; expiraEm: string }> {
  const pastaId = (input.pastaId || "").trim();
  if (!pastaId) throw new Error("pasta_obrigatoria");

  const meses = parseMesesInput(input.meses);
  if (meses.length === 0) throw new Error("meses_obrigatorios");

  const pasta = await prisma.pasta.findFirst({
    where: { id: pastaId, programacaoId },
    select: { id: true },
  });
  if (!pasta) throw new Error("pasta_nao_encontrada");

  const inicioYmd = todayBrYmd();
  const expiraYmd = addYearsYmd(inicioYmd, CRONOGRAMA_SHUFFLE_ANOS);
  const periodos = expandShuffleMonthPeriods(meses, inicioYmd, expiraYmd);
  if (periodos.length === 0) throw new Error("nenhum_periodo_no_intervalo");

  const agendamentoIds: string[] = [];
  for (const p of periodos) {
    const created = await createAgendamento(programacaoId, {
      alvoTipo: "pasta",
      alvoId: pastaId,
      diasSemana: input.diasSemana,
      horaInicio: input.horaInicio,
      horaFim: input.horaFim,
      dataInicio: p.dataInicio,
      dataFim: p.dataFim,
      frequenciaMusicas: input.frequenciaMusicas,
    });
    agendamentoIds.push(created.id);
  }

  const shuffle = await prisma.cronogramaShuffle.create({
    data: {
      programacaoId,
      pastaId,
      meses: mesesCsvFromNumbers(meses),
      diasSemana: input.diasSemana ?? "",
      horaInicio: input.horaInicio ?? "00:00",
      horaFim: input.horaFim ?? "23:59",
      frequenciaMusicas:
        input.frequenciaMusicas != null && Number.isFinite(input.frequenciaMusicas) ?
          Math.max(1, Math.round(input.frequenciaMusicas))
        : null,
      expiraEm: new Date(expiraYmd + "T00:00:00.000Z"),
      agendamentoIds,
    },
    select: { id: true },
  });

  return {
    shuffleId: shuffle.id,
    regrasCriadas: agendamentoIds.length,
    expiraEm: expiraYmd,
  };
}
