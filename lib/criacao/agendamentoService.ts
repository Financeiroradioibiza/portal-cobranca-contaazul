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
  frequenciaMusicas: number | null;
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

function normalizeFreqInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (!Number.isFinite(Number(v))) return null;
  return Math.max(1, Math.round(Number(v)));
}

function mapAgendamentoRows(
  ags: {
    id: string;
    programacaoId: string;
    alvoTipo: string;
    alvoId: string;
    diasSemana: string;
    horaInicio: string;
    horaFim: string;
    dataInicio: Date | null;
    dataFim: Date | null;
    frequenciaMin: number | null;
    frequenciaMusicas: number | null;
    prioridade: number;
    ativo: boolean;
  }[],
  nomeByProg: Map<string, Map<string, string>>,
): Map<string, AgendamentoRow[]> {
  const result = new Map<string, AgendamentoRow[]>();
  for (const progId of nomeByProg.keys()) {
    result.set(progId, []);
  }
  for (const a of ags) {
    const nomes = nomeByProg.get(a.programacaoId);
    if (!nomes) continue;
    result.get(a.programacaoId)!.push({
      id: a.id,
      alvoTipo: a.alvoTipo,
      alvoId: a.alvoId,
      alvoNome: nomes.get(a.alvoTipo + ":" + a.alvoId) ?? "(removido)",
      diasSemana: a.diasSemana,
      horaInicio: a.horaInicio,
      horaFim: a.horaFim,
      dataInicio: a.dataInicio ? a.dataInicio.toISOString().slice(0, 10) : null,
      dataFim: a.dataFim ? a.dataFim.toISOString().slice(0, 10) : null,
      frequenciaMin: a.frequenciaMin,
      frequenciaMusicas: a.frequenciaMusicas,
      prioridade: a.prioridade,
      ativo: a.ativo,
    });
  }
  return result;
}

export async function listAgendamentosByProgramacaoIds(
  programacaoIds: string[],
): Promise<Map<string, AgendamentoRow[]>> {
  const ids = [...new Set(programacaoIds.filter(Boolean))];
  if (ids.length === 0) return new Map();

  const [ags, pastas, vinhetas] = await Promise.all([
    prisma.agendamento.findMany({
      where: { programacaoId: { in: ids } },
      orderBy: [{ programacaoId: "asc" }, { alvoTipo: "asc" }, { horaInicio: "asc" }],
    }),
    prisma.pasta.findMany({
      where: { programacaoId: { in: ids } },
      select: { id: true, nome: true, programacaoId: true },
    }),
    prisma.vinheta.findMany({
      where: { programacaoId: { in: ids } },
      select: { id: true, nome: true, programacaoId: true },
    }),
  ]);

  const nomeByProg = new Map<string, Map<string, string>>();
  for (const progId of ids) nomeByProg.set(progId, new Map());
  for (const p of pastas) {
    const m = nomeByProg.get(p.programacaoId);
    if (m) m.set("pasta:" + p.id, p.nome);
  }
  for (const v of vinhetas) {
    if (!v.programacaoId) continue;
    const m = nomeByProg.get(v.programacaoId);
    if (m) m.set("vinheta:" + v.id, v.nome);
  }

  return mapAgendamentoRows(ags, nomeByProg);
}

export async function listAgendamentos(programacaoId: string): Promise<AgendamentoRow[]> {
  const map = await listAgendamentosByProgramacaoIds([programacaoId]);
  return map.get(programacaoId) ?? [];
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
    frequenciaMusicas?: number | null;
    prioridade?: number;
  },
) {
  const alvoTipo = input.alvoTipo === "vinheta" ? "vinheta" : "pasta";
  const alvoId = (input.alvoId || "").trim();
  if (!alvoId) throw new Error("alvo_obrigatorio");

  const freqMin = normalizeFreqInt(input.frequenciaMin);
  const freqMusicas = normalizeFreqInt(input.frequenciaMusicas);

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
      frequenciaMin: alvoTipo === "vinheta" ? freqMin : null,
      frequenciaMusicas: alvoTipo === "vinheta" ? freqMusicas : null,
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
    frequenciaMusicas?: number | null;
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
    data.frequenciaMin = normalizeFreqInt(patch.frequenciaMin);
  }
  if ("frequenciaMusicas" in patch) {
    data.frequenciaMusicas = normalizeFreqInt(patch.frequenciaMusicas);
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
