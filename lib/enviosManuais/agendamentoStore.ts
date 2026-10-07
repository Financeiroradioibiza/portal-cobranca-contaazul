import { prisma } from "@/lib/prisma";
import type { EnvioManualAgendamentoDto, EnvioManualGrupoCliente, EnvioManualLogDto } from "@/lib/enviosManuais/types";

function parseEmails(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json.filter((e): e is string => typeof e === "string" && e.trim().length > 0);
}

function parseGrupo(json: unknown): EnvioManualGrupoCliente[] | null {
  if (!Array.isArray(json) || !json.length) return null;
  const out: EnvioManualGrupoCliente[] = [];
  for (const item of json) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const id = String(r.id ?? "").trim();
    const nome = String(r.nome ?? r.name ?? "").trim();
    if (id && nome) out.push({ id, nome });
  }
  return out.length ? out : null;
}

function compareAgendamentosByDia(a: EnvioManualAgendamentoDto, b: EnvioManualAgendamentoDto): number {
  if (a.day !== b.day) return a.day - b.day;
  return a.client.localeCompare(b.client, "pt-BR", { sensitivity: "base" });
}

function sortAgendamentosByDia(items: EnvioManualAgendamentoDto[]): EnvioManualAgendamentoDto[] {
  return [...items].sort(compareAgendamentosByDia);
}

function rowToDto(row: {
  id: string;
  tipo: string;
  clientLabel: string;
  caClienteId: string | null;
  diaMes: number;
  recorrente: boolean;
  emails: unknown;
  mensagem: string;
  colorIdx: number;
  sent: boolean;
  grupoClientes: unknown;
}): EnvioManualAgendamentoDto {
  const tipo = row.tipo === "grupo" ? "grupo" : "individual";
  return {
    id: row.id,
    tipo,
    client: row.clientLabel,
    clienteId: row.caClienteId,
    day: row.diaMes,
    rec: row.recorrente,
    emails: parseEmails(row.emails),
    msg: row.mensagem,
    colorIdx: row.colorIdx,
    sent: row.sent,
    grupoClientes: parseGrupo(row.grupoClientes),
  };
}

export async function listEnvioManualAgendamentos(): Promise<EnvioManualAgendamentoDto[]> {
  const rows = await prisma.envioManualAgendamento.findMany({
    orderBy: [{ diaMes: "asc" }, { clientLabel: "asc" }],
  });
  return rows.map(rowToDto);
}

export async function replaceEnvioManualAgendamentos(items: EnvioManualAgendamentoDto[]): Promise<number> {
  const sorted = sortAgendamentosByDia(items);
  await prisma.$transaction(async (tx) => {
    await tx.envioManualAgendamento.deleteMany();
    if (!sorted.length) return;
    await tx.envioManualAgendamento.createMany({
      data: sorted.map((a, idx) => ({
        id: a.id,
        tipo: a.tipo,
        clientLabel: a.client,
        caClienteId: a.clienteId,
        diaMes: a.day,
        recorrente: a.rec,
        emails: a.emails,
        mensagem: a.msg,
        colorIdx: a.colorIdx,
        sent: a.sent,
        grupoClientes: a.grupoClientes ?? undefined,
        sortOrder: idx,
      })),
    });
  });
  return sorted.length;
}

export async function markAgendamentoSent(id: string): Promise<void> {
  await prisma.envioManualAgendamento.update({ where: { id }, data: { sent: true } });
}

export async function appendEnvioManualLog(entry: Omit<EnvioManualLogDto, "id" | "dt"> & { sandbox: boolean }): Promise<void> {
  await prisma.envioManualLog.create({
    data: {
      clientLabel: entry.client,
      emailsSnapshot: entry.emails,
      referencia: entry.ref,
      ok: entry.ok,
      aviso: entry.aviso ?? "",
      sandbox: entry.sandbox,
    },
  });
}

export async function listEnvioManualLogs(limit = 200): Promise<EnvioManualLogDto[]> {
  const rows = await prisma.envioManualLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    client: r.clientLabel,
    emails: r.emailsSnapshot,
    dt: r.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    ref: r.referencia,
    ok: r.ok,
    aviso: r.aviso || null,
    sandbox: r.sandbox,
  }));
}
