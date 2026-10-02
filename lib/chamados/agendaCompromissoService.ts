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
  };
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
    },
  });

  return toView(row, ctx.email);
}

export async function deleteAgendaCompromisso(id: string, ctx: ChamadoUserContext): Promise<void> {
  const row = await prisma.portalAgendaCompromisso.findUnique({ where: { id } });
  if (!row) throw new Error("not_found");
  if (row.criadoPorEmail.toLowerCase() !== ctx.email.toLowerCase()) throw new Error("forbidden");
  await prisma.portalAgendaCompromisso.delete({ where: { id } });
}
