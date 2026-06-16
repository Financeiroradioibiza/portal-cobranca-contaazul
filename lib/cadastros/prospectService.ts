import type { Prospect, ProspectEstagio } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ProspectView } from "@/lib/cadastros/prospectTypes";

const VALID_ESTAGIOS = new Set<ProspectEstagio>(["lead", "em_contato", "demo_enviada", "fechado"]);

export type ProspectUserContext = {
  email: string;
  displayName: string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function prospectToView(row: Prospect): ProspectView {
  return {
    id: row.id,
    nome: row.nome,
    cidade: row.cidade,
    estado: row.estado,
    unidades: row.unidades,
    origem: row.origem,
    statusNota: row.statusNota,
    valorCentavos: row.valorCentavos,
    estagio: row.estagio,
    contatoNome: row.contatoNome,
    contatoEmail: row.contatoEmail,
    contatoTelefone: row.contatoTelefone,
    observacoes: row.observacoes,
    previewMusicalUrl: row.previewMusicalUrl,
    previewMusicalNota: row.previewMusicalNota,
    propostaEnviadaEm: row.propostaEnviadaEm?.toISOString() ?? null,
    demoEnviadaEm: row.demoEnviadaEm?.toISOString() ?? null,
    fechadoEm: row.fechadoEm?.toISOString() ?? null,
    rioGrupoNome: row.rioGrupoNome,
    templateProgramacao: row.templateProgramacao,
    pedidoClienteId: row.pedidoClienteId,
    criadoPorEmail: row.criadoPorEmail,
    criadoPorNome: row.criadoPorNome,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function parseEstagio(raw: unknown): ProspectEstagio | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase() as ProspectEstagio;
  return VALID_ESTAGIOS.has(v) ? v : null;
}

export async function listProspects(): Promise<ProspectView[]> {
  const rows = await prisma.prospect.findMany({ orderBy: [{ estagio: "asc" }, { updatedAt: "desc" }] });
  return rows.map(prospectToView);
}

export async function createProspect(
  input: {
    nome: string;
    cidade?: string;
    estado?: string;
    unidades?: number;
    origem?: string;
    statusNota?: string;
    valorCentavos?: number;
    contatoNome?: string;
    contatoEmail?: string;
    contatoTelefone?: string;
    observacoes?: string;
  },
  ctx: ProspectUserContext,
): Promise<ProspectView> {
  const nome = input.nome.trim().slice(0, 200);
  if (!nome) throw new Error("nome_obrigatorio");
  const unidades = Math.max(1, Math.min(999, input.unidades ?? 1));

  const row = await prisma.prospect.create({
    data: {
      nome,
      cidade: str(input.cidade).slice(0, 120),
      estado: str(input.estado).slice(0, 2).toUpperCase(),
      unidades,
      origem: str(input.origem).slice(0, 200),
      statusNota: str(input.statusNota).slice(0, 200),
      valorCentavos: Math.max(0, input.valorCentavos ?? 0),
      contatoNome: str(input.contatoNome).slice(0, 120),
      contatoEmail: str(input.contatoEmail).slice(0, 200),
      contatoTelefone: str(input.contatoTelefone).slice(0, 40),
      observacoes: str(input.observacoes).slice(0, 8000),
      criadoPorEmail: ctx.email,
      criadoPorNome: ctx.displayName,
    },
  });
  return prospectToView(row);
}

export async function updateProspect(
  id: string,
  input: Partial<{
    nome: string;
    cidade: string;
    estado: string;
    unidades: number;
    origem: string;
    statusNota: string;
    valorCentavos: number;
    estagio: ProspectEstagio;
    contatoNome: string;
    contatoEmail: string;
    contatoTelefone: string;
    observacoes: string;
    previewMusicalUrl: string;
    previewMusicalNota: string;
    rioGrupoNome: string;
    templateProgramacao: string;
    pedidoClienteId: string | null;
    registrarContato: boolean;
    enviarProposta: boolean;
    enviarDemo: boolean;
    fechar: boolean;
  }>,
): Promise<ProspectView> {
  const existing = await prisma.prospect.findUnique({ where: { id } });
  if (!existing) throw new Error("not_found");

  const data: Parameters<typeof prisma.prospect.update>[0]["data"] = {};

  if (input.nome !== undefined) {
    const n = input.nome.trim().slice(0, 200);
    if (!n) throw new Error("nome_obrigatorio");
    data.nome = n;
  }
  if (input.cidade !== undefined) data.cidade = input.cidade.trim().slice(0, 120);
  if (input.estado !== undefined) data.estado = input.estado.trim().slice(0, 2).toUpperCase();
  if (input.unidades !== undefined) data.unidades = Math.max(1, Math.min(999, input.unidades));
  if (input.origem !== undefined) data.origem = input.origem.trim().slice(0, 200);
  if (input.statusNota !== undefined) data.statusNota = input.statusNota.trim().slice(0, 200);
  if (input.valorCentavos !== undefined) data.valorCentavos = Math.max(0, input.valorCentavos);
  if (input.estagio !== undefined && VALID_ESTAGIOS.has(input.estagio)) {
    data.estagio = input.estagio;
    if (input.estagio === "fechado" && !existing.fechadoEm) data.fechadoEm = new Date();
    if (input.estagio !== "fechado") data.fechadoEm = null;
  }
  if (input.contatoNome !== undefined) data.contatoNome = input.contatoNome.trim().slice(0, 120);
  if (input.contatoEmail !== undefined) data.contatoEmail = input.contatoEmail.trim().slice(0, 200);
  if (input.contatoTelefone !== undefined) data.contatoTelefone = input.contatoTelefone.trim().slice(0, 40);
  if (input.observacoes !== undefined) data.observacoes = input.observacoes.trim().slice(0, 8000);
  if (input.previewMusicalUrl !== undefined) data.previewMusicalUrl = input.previewMusicalUrl.trim().slice(0, 8000);
  if (input.previewMusicalNota !== undefined) {
    data.previewMusicalNota = input.previewMusicalNota.trim().slice(0, 400);
  }
  if (input.rioGrupoNome !== undefined) data.rioGrupoNome = input.rioGrupoNome.trim().slice(0, 200);
  if (input.templateProgramacao !== undefined) {
    data.templateProgramacao = input.templateProgramacao.trim().slice(0, 200);
  }
  if (input.pedidoClienteId !== undefined) data.pedidoClienteId = input.pedidoClienteId;

  if (input.registrarContato) {
    data.estagio = "em_contato";
    if (!data.statusNota && !existing.statusNota) data.statusNota = "contato registrado";
  }
  if (input.enviarProposta) {
    data.estagio = "em_contato";
    data.propostaEnviadaEm = new Date();
    if (!data.statusNota) data.statusNota = "proposta enviada";
  }
  if (input.enviarDemo) {
    data.estagio = "demo_enviada";
    data.demoEnviadaEm = new Date();
    if (!data.statusNota) data.statusNota = "demo enviada";
  }
  if (input.fechar) {
    data.estagio = "fechado";
    data.fechadoEm = new Date();
    if (!data.statusNota) data.statusNota = "cliente fechado";
  }

  const row = await prisma.prospect.update({ where: { id }, data });
  return prospectToView(row);
}

export function prospectToPedidoPrefill(p: ProspectView): {
  nomeFantasia: string;
  clienteNome: string;
  razaoSocial: string;
  cidade: string;
  uf: string;
  contatoLojaNome: string;
  contatoLojaWhatsapp: string;
  contatoLojaEmail: string;
  prospectId: string;
} {
  return {
    nomeFantasia: p.nome,
    clienteNome: p.nome,
    razaoSocial: p.nome,
    cidade: p.cidade,
    uf: p.estado,
    contatoLojaNome: p.contatoNome,
    contatoLojaWhatsapp: p.contatoTelefone,
    contatoLojaEmail: p.contatoEmail,
    prospectId: p.id,
  };
}
