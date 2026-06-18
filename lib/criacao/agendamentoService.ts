import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AgendamentoAlvo = "pasta" | "vinheta";

export type AgendamentoRow = {
  id: string;
  alvoTipo: string;
  alvoId: string;
  alvoNome: string;
  diasSemana: string;
  horaInicio: string;
  horaFim: string;
  dataInicio: string | null;
  dataFim: string | null;
  frequenciaMin: number | null;
  prioridade: number;
  ativo: boolean;
};

const HORA = /^\d{2}:\d{2}$/;

function normalizeDias(v: unknown): string {
  if (typeof v !== "string") return "";
  const set = new Set(
    v
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
  );
  return Array.from(set).sort((a, b) => a - b).join(",");
}

function normalizeHora(v: unknown, def: string): string {
  return typeof v === "string" && HORA.test(v) ? v : def;
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function listAgendamentos(programacaoId: string): Promise<AgendamentoRow[]> {
  const [ags, pastas, vinhetas] = await Promise.all([
    prisma.agendamento.findMany({
      where: { programacaoId },
      orderBy: [{ alvoTipo: "asc" }, { horaInicio: "asc" }],
    }),
    prisma.pasta.findMany({ where: { programacaoId }, select: { id: true, nome: true } }),
    prisma.vinheta.findMany({ where: { programacaoId }, select: { id: true, nome: true } }),
  ]);
  const nome = new Map<string, string>();
  for (const p of pastas) nome.set("pasta:" + p.id, p.nome);
  for (const v of vinhetas) nome.set("vinheta:" + v.id, v.nome);

  return ags.map((a) => ({
    id: a.id,
    alvoTipo: a.alvoTipo,
    alvoId: a.alvoId,
    alvoNome: nome.get(a.alvoTipo + ":" + a.alvoId) ?? "(removido)",
    diasSemana: a.diasSemana,
    horaInicio: a.horaInicio,
    horaFim: a.horaFim,
    dataInicio: a.dataInicio ? a.dataInicio.toISOString().slice(0, 10) : null,
    dataFim: a.dataFim ? a.dataFim.toISOString().slice(0, 10) : null,
    frequenciaMin: a.frequenciaMin,
    prioridade: a.prioridade,
    ativo: a.ativo,
  }));
}

export async function createAgendamento(
  programacaoId: string,
  input: {
    alvoTipo?: string;
    alvoId?: string;
    diasSemana?: string;
    horaInicio?: string;
    horaFim?: string;
    dataInicio?: string;
    dataFim?: string;
    frequenciaMin?: number | null;
    prioridade?: number;
  },
) {
  const alvoTipo = input.alvoTipo === "vinheta" ? "vinheta" : "pasta";
  const alvoId = (input.alvoId || "").trim();
  if (!alvoId) throw new Error("alvo_obrigatorio");

  const freq =
    input.frequenciaMin != null && Number.isFinite(Number(input.frequenciaMin))
      ? Math.max(1, Math.round(Number(input.frequenciaMin)))
      : null;

  return prisma.agendamento.create({
    data: {
      programacaoId,
      alvoTipo,
      alvoId,
      diasSemana: normalizeDias(input.diasSemana),
      horaInicio: normalizeHora(input.horaInicio, "00:00"),
      horaFim: normalizeHora(input.horaFim, "23:59"),
      dataInicio: parseDate(input.dataInicio),
      dataFim: parseDate(input.dataFim),
      frequenciaMin: alvoTipo === "vinheta" ? freq : null,
      prioridade: Number.isFinite(Number(input.prioridade)) ? Math.round(Number(input.prioridade)) : 0,
    },
    select: { id: true },
  });
}

export async function updateAgendamento(
  id: string,
  patch: {
    diasSemana?: string;
    horaInicio?: string;
    horaFim?: string;
    dataInicio?: string | null;
    dataFim?: string | null;
    frequenciaMin?: number | null;
    prioridade?: number;
    ativo?: boolean;
  },
): Promise<boolean> {
  const data: Prisma.AgendamentoUpdateInput = {};
  if ("diasSemana" in patch) data.diasSemana = normalizeDias(patch.diasSemana);
  if ("horaInicio" in patch) data.horaInicio = normalizeHora(patch.horaInicio, "00:00");
  if ("horaFim" in patch) data.horaFim = normalizeHora(patch.horaFim, "23:59");
  if ("dataInicio" in patch) data.dataInicio = parseDate(patch.dataInicio);
  if ("dataFim" in patch) data.dataFim = parseDate(patch.dataFim);
  if ("frequenciaMin" in patch) {
    data.frequenciaMin =
      patch.frequenciaMin != null && Number.isFinite(Number(patch.frequenciaMin))
        ? Math.max(1, Math.round(Number(patch.frequenciaMin)))
        : null;
  }
  if (typeof patch.prioridade === "number") data.prioridade = Math.round(patch.prioridade);
  if (typeof patch.ativo === "boolean") data.ativo = patch.ativo;
  if (Object.keys(data).length === 0) return false;
  await prisma.agendamento.update({ where: { id }, data });
  return true;
}

export async function deleteAgendamento(id: string): Promise<void> {
  await prisma.agendamento.delete({ where: { id } });
}
