import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import { parseStringArrayJson, serializeStringArray } from "@/lib/chamados/chamadoUtils";
import type { ChamadoUserContext } from "@/lib/chamados/chamadoService";

export type AgendaCompromissoView = {
  id: string;
  titulo: string;
  descricao: string;
  inicioEm: string;
  horaLabel: string;
  criadoPorEmail: string;
  criadoPorNome: string;
  participantes: string[];
  /** Para o usuário da sessão. */
  papel: "criador" | "convidado";
  alarmeAtivo: boolean;
};

function fmtHora(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function normalizeEmails(raw: string[]): string[] {
  return [...new Set(raw.map((e) => normalizePortalEmail(e.trim())).filter((e) => e.includes("@")))];
}

function userSeesCompromisso(
  row: { criadoPorEmail: string; participantesJson: string },
  userEmail: string,
): boolean {
  const me = userEmail.toLowerCase();
  if (row.criadoPorEmail.toLowerCase() === me) return true;
  return parseStringArrayJson(row.participantesJson).some((e) => e.toLowerCase() === me);
}

function toView(
  row: {
    id: string;
    titulo: string;
    descricao: string;
    inicioEm: Date;
    criadoPorEmail: string;
    criadoPorNome: string;
    participantesJson: string;
    alarmeAtivo: boolean;
  },
  userEmail: string,
): AgendaCompromissoView {
  const iso = row.inicioEm.toISOString();
  const papel =
    row.criadoPorEmail.toLowerCase() === userEmail.toLowerCase() ? "criador" : "convidado";
  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao,
    inicioEm: iso,
    horaLabel: fmtHora(iso),
    criadoPorEmail: row.criadoPorEmail,
    criadoPorNome: row.criadoPorNome,
    participantes: parseStringArrayJson(row.participantesJson),
    papel,
    alarmeAtivo: row.alarmeAtivo,
  };
}

export function parseCompromissoAlarmeAtivo(raw: unknown): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === true || raw === 1 || raw === "1" || raw === "true") return true;
  if (raw === false || raw === 0 || raw === "0" || raw === "false") return false;
  return undefined;
}

export async function listAgendaCompromissosForUser(
  userEmail: string,
  fromIso: string,
  toIso: string,
): Promise<AgendaCompromissoView[]> {
  const email = normalizePortalEmail(userEmail);
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];

  const rows = await prisma.portalAgendaCompromisso.findMany({
    where: { inicioEm: { gte: from, lte: to } },
    orderBy: { inicioEm: "asc" },
  });

  const out: AgendaCompromissoView[] = [];
  for (const row of rows) {
    if (!userSeesCompromisso(row, email)) continue;
    out.push(toView(row, email));
  }
  return out;
}

export async function createAgendaCompromisso(
  input: {
    titulo: string;
    descricao?: string;
    inicioEm: string;
    participantes?: string[];
    alarmeAtivo?: boolean;
  },
  ctx: ChamadoUserContext,
): Promise<AgendaCompromissoView> {
  const titulo = input.titulo.trim().slice(0, 200);
  if (!titulo) throw new Error("titulo_obrigatorio");

  const inicio = new Date(input.inicioEm);
  if (Number.isNaN(inicio.getTime())) throw new Error("inicio_invalido");

  const participantes = normalizeEmails(input.participantes ?? []).filter(
    (e) => e.toLowerCase() !== ctx.email.toLowerCase(),
  );

  const row = await prisma.portalAgendaCompromisso.create({
    data: {
      titulo,
      descricao: (input.descricao ?? "").trim().slice(0, 4000),
      inicioEm: inicio,
      criadoPorEmail: ctx.email,
      criadoPorNome: ctx.displayName,
      participantesJson: serializeStringArray(participantes),
      alarmeAtivo: Boolean(input.alarmeAtivo),
      alarmeNotificado: false,
    },
  });

  return toView(row, ctx.email);
}

export async function updateAgendaCompromisso(
  id: string,
  input: {
    titulo?: string;
    descricao?: string;
    inicioEm?: string;
    participantes?: string[];
    alarmeAtivo?: boolean;
  },
  ctx: ChamadoUserContext,
): Promise<AgendaCompromissoView> {
  const row = await prisma.portalAgendaCompromisso.findUnique({ where: { id } });
  if (!row) throw new Error("not_found");
  if (row.criadoPorEmail.toLowerCase() !== ctx.email.toLowerCase()) throw new Error("forbidden");

  const data: {
    titulo?: string;
    descricao?: string;
    inicioEm?: Date;
    participantesJson?: string;
    alarmeAtivo?: boolean;
    alarmeNotificado?: boolean;
  } = {};

  let resetAlarme = false;

  if (input.titulo !== undefined) {
    const titulo = input.titulo.trim().slice(0, 200);
    if (!titulo) throw new Error("titulo_obrigatorio");
    data.titulo = titulo;
  }
  if (input.descricao !== undefined) {
    data.descricao = input.descricao.trim().slice(0, 4000);
  }
  if (input.inicioEm !== undefined) {
    const inicio = new Date(input.inicioEm);
    if (Number.isNaN(inicio.getTime())) throw new Error("inicio_invalido");
    data.inicioEm = inicio;
    if (inicio.getTime() !== row.inicioEm.getTime()) resetAlarme = true;
  }
  if (input.alarmeAtivo !== undefined) {
    data.alarmeAtivo = input.alarmeAtivo;
    if (input.alarmeAtivo && !row.alarmeAtivo) resetAlarme = true;
    if (!input.alarmeAtivo) data.alarmeNotificado = false;
  }
  if (input.participantes !== undefined) {
    const participantes = normalizeEmails(input.participantes).filter(
      (e) => e.toLowerCase() !== ctx.email.toLowerCase(),
    );
    data.participantesJson = serializeStringArray(participantes);
  }

  if (resetAlarme && (input.alarmeAtivo ?? row.alarmeAtivo)) {
    data.alarmeNotificado = false;
  }

  const updated = await prisma.portalAgendaCompromisso.update({
    where: { id },
    data,
  });
  return toView(updated, ctx.email);
}

export async function deleteAgendaCompromisso(id: string, ctx: ChamadoUserContext): Promise<void> {
  const row = await prisma.portalAgendaCompromisso.findUnique({ where: { id } });
  if (!row) throw new Error("not_found");
  if (row.criadoPorEmail.toLowerCase() !== ctx.email.toLowerCase()) throw new Error("forbidden");
  await prisma.portalAgendaCompromisso.delete({ where: { id } });
}
