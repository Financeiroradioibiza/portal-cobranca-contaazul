import type { PedidoClientePdv, PedidoClienteStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createChamado, getChamadoUserContext } from "@/lib/chamados/chamadoService";
import type { PedidoClienteView, PedidoPdvPayload } from "@/lib/cadastros/prospectTypes";
import {
  createRioCompClienteLinha,
  createRioCompPdvsBulk,
  patchRioCompClienteLinha,
} from "@/lib/rio/rioClienteCompService";
import { pickVigenteRioYearMonth } from "@/lib/cadastros/vigenteRioMonth";
import { currentBrazilYearMonth } from "@/lib/manualReminders/yearMonth";

const VALID_STATUS = new Set<PedidoClienteStatus>([
  "rascunho",
  "enviado",
  "em_analise",
  "importado",
  "cancelado",
]);

export type PedidoUserContext = {
  email: string;
  displayName: string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function parsePdvsJson(raw: string): PedidoPdvPayload[] {
  try {
    const v = JSON.parse(raw || "[]");
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is PedidoPdvPayload => typeof x === "object" && x !== null) as PedidoPdvPayload[];
  } catch {
    return [];
  }
}

export function serializePdvsJson(pdvs: PedidoPdvPayload[]): string {
  return JSON.stringify(pdvs);
}

export function normalizePdvPayload(raw: Partial<PedidoPdvPayload>): PedidoPdvPayload {
  return {
    nome: str(raw.nome).slice(0, 200),
    documento: str(raw.documento).slice(0, 64),
    cep: str(raw.cep).slice(0, 12),
    endereco: str(raw.endereco).slice(0, 200),
    numero: str(raw.numero).slice(0, 20),
    complemento: str(raw.complemento).slice(0, 80),
    bairro: str(raw.bairro).slice(0, 80),
    cidade: str(raw.cidade).slice(0, 80),
    estado: str(raw.estado).slice(0, 2).toUpperCase(),
    programacaoMusical: str(raw.programacaoMusical).slice(0, 120),
    contatoLojaNome: str(raw.contatoLojaNome).slice(0, 120),
    contatoLojaEmail: str(raw.contatoLojaEmail).slice(0, 200),
    contatoLojaTelefone: str(raw.contatoLojaTelefone).slice(0, 40),
    contatoCobrancaNome: str(raw.contatoCobrancaNome).slice(0, 120),
    contatoCobrancaEmail: str(raw.contatoCobrancaEmail).slice(0, 200),
    contatoCobrancaTelefone: str(raw.contatoCobrancaTelefone).slice(0, 40),
    observacoes: str(raw.observacoes).slice(0, 2000),
  };
}

export function pedidoToView(row: PedidoClientePdv): PedidoClienteView {
  return {
    id: row.id,
    status: row.status,
    chamadoId: row.chamadoId,
    rioLinhaId: row.rioLinhaId,
    importadoEm: row.importadoEm?.toISOString() ?? null,
    importadoPorEmail: row.importadoPorEmail,
    prospectId: row.prospectId,
    nomeFantasia: row.nomeFantasia,
    razaoSocial: row.razaoSocial,
    documento: row.documento,
    emailCobranca: row.emailCobranca,
    origemCliente: row.origemCliente,
    valorPdvUnitarioTexto: row.valorPdvUnitarioTexto,
    numeroPdvSite: row.numeroPdvSite,
    categoriaSite: row.categoriaSite,
    observacoesCliente: row.observacoesCliente,
    rioGrupoId: row.rioGrupoId,
    grupoSite: row.grupoSite,
    pdvs: parsePdvsJson(row.pdvsJson),
    criadoPorEmail: row.criadoPorEmail,
    criadoPorNome: row.criadoPorNome,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function formatPedidoChamadoDesc(p: PedidoClienteView): string {
  const lines = [
    `Pedido #${p.id}`,
    `Cliente: ${p.nomeFantasia}`,
    p.razaoSocial ? `Razão social: ${p.razaoSocial}` : "",
    p.documento ? `CNPJ: ${p.documento}` : "",
    p.emailCobranca ? `E-mail cobrança: ${p.emailCobranca}` : "",
    p.valorPdvUnitarioTexto ? `Valor PDV: ${p.valorPdvUnitarioTexto}` : "",
    `PDVs: ${p.pdvs.length || p.numeroPdvSite}`,
    p.grupoSite ? `Grupo/MARCA: ${p.grupoSite}` : "",
    p.observacoesCliente ? `\nObservações:\n${p.observacoesCliente}` : "",
    "\n--- PDVs ---",
    ...p.pdvs.map(
      (pdv, i) =>
        `${i + 1}. ${pdv.nome}${pdv.documento ? ` (${pdv.documento})` : ""}\n` +
        `   ${pdv.endereco ? `${pdv.endereco}, ${pdv.numero} — ${pdv.cidade}/${pdv.estado}` : pdv.cidade ? `${pdv.cidade}/${pdv.estado}` : ""}\n` +
        `   Prog.: ${pdv.programacaoMusical || "—"}`,
    ),
    `\nAbrir pedido: /cadastros/cliente-pdv-novo?id=${p.id}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export async function listPedidosCliente(): Promise<PedidoClienteView[]> {
  const rows = await prisma.pedidoClientePdv.findMany({ orderBy: { updatedAt: "desc" } });
  return rows.map(pedidoToView);
}

export async function getPedidoCliente(id: string): Promise<PedidoClienteView | null> {
  const row = await prisma.pedidoClientePdv.findUnique({ where: { id } });
  return row ? pedidoToView(row) : null;
}

export type SavePedidoInput = {
  nomeFantasia: string;
  razaoSocial?: string;
  documento?: string;
  emailCobranca?: string;
  origemCliente?: string;
  valorPdvUnitarioTexto?: string;
  numeroPdvSite?: number;
  categoriaSite?: string;
  observacoesCliente?: string;
  rioGrupoId?: string | null;
  grupoSite?: string;
  pdvs?: Partial<PedidoPdvPayload>[];
  prospectId?: string | null;
};

export async function createPedidoCliente(
  input: SavePedidoInput,
  ctx: PedidoUserContext,
): Promise<PedidoClienteView> {
  const nomeFantasia = input.nomeFantasia.trim().slice(0, 200);
  if (!nomeFantasia) throw new Error("nome_obrigatorio");
  const pdvs = (input.pdvs ?? []).map(normalizePdvPayload).filter((p) => p.nome);

  const row = await prisma.pedidoClientePdv.create({
    data: {
      nomeFantasia,
      razaoSocial: str(input.razaoSocial).slice(0, 8000) || nomeFantasia,
      documento: str(input.documento).slice(0, 64) || null,
      emailCobranca: str(input.emailCobranca).slice(0, 200),
      origemCliente: str(input.origemCliente).slice(0, 10),
      valorPdvUnitarioTexto: str(input.valorPdvUnitarioTexto).slice(0, 200),
      numeroPdvSite: Math.max(1, input.numeroPdvSite ?? (pdvs.length || 1)),
      categoriaSite: str(input.categoriaSite).slice(0, 120),
      observacoesCliente: str(input.observacoesCliente).slice(0, 8000),
      rioGrupoId: input.rioGrupoId?.trim() || null,
      grupoSite: str(input.grupoSite).slice(0, 200),
      pdvsJson: serializePdvsJson(pdvs),
      prospectId: input.prospectId?.trim() || null,
      criadoPorEmail: ctx.email,
      criadoPorNome: ctx.displayName,
    },
  });
  return pedidoToView(row);
}

export async function updatePedidoCliente(
  id: string,
  input: Partial<SavePedidoInput>,
): Promise<PedidoClienteView> {
  const existing = await prisma.pedidoClientePdv.findUnique({ where: { id } });
  if (!existing) throw new Error("not_found");
  if (existing.status === "importado") throw new Error("pedido_importado");

  const nomeFantasia =
    input.nomeFantasia !== undefined ?
      input.nomeFantasia.trim().slice(0, 200)
    : existing.nomeFantasia;
  if (!nomeFantasia) throw new Error("nome_obrigatorio");

  const pdvs =
    input.pdvs !== undefined ?
      input.pdvs.map(normalizePdvPayload).filter((p) => p.nome)
    : parsePdvsJson(existing.pdvsJson);

  const row = await prisma.pedidoClientePdv.update({
    where: { id },
    data: {
      nomeFantasia,
      razaoSocial:
        input.razaoSocial !== undefined ?
          str(input.razaoSocial).slice(0, 8000)
        : undefined,
      documento: input.documento !== undefined ? str(input.documento).slice(0, 64) || null : undefined,
      emailCobranca:
        input.emailCobranca !== undefined ? str(input.emailCobranca).slice(0, 200) : undefined,
      origemCliente:
        input.origemCliente !== undefined ? str(input.origemCliente).slice(0, 10) : undefined,
      valorPdvUnitarioTexto:
        input.valorPdvUnitarioTexto !== undefined ?
          str(input.valorPdvUnitarioTexto).slice(0, 200)
        : undefined,
      numeroPdvSite:
        input.numeroPdvSite !== undefined ?
          Math.max(1, input.numeroPdvSite)
        : pdvs.length || undefined,
      categoriaSite:
        input.categoriaSite !== undefined ? str(input.categoriaSite).slice(0, 120) : undefined,
      observacoesCliente:
        input.observacoesCliente !== undefined ?
          str(input.observacoesCliente).slice(0, 8000)
        : undefined,
      rioGrupoId: input.rioGrupoId !== undefined ? input.rioGrupoId?.trim() || null : undefined,
      grupoSite: input.grupoSite !== undefined ? str(input.grupoSite).slice(0, 200) : undefined,
      pdvsJson: input.pdvs !== undefined ? serializePdvsJson(pdvs) : undefined,
      prospectId: input.prospectId !== undefined ? input.prospectId?.trim() || null : undefined,
    },
  });
  return pedidoToView(row);
}

export async function enviarPedidoCliente(
  id: string,
  ctx: PedidoUserContext,
): Promise<PedidoClienteView> {
  const existing = await prisma.pedidoClientePdv.findUnique({ where: { id } });
  if (!existing) throw new Error("not_found");
  if (existing.status !== "rascunho" && existing.status !== "enviado") {
    throw new Error("status_invalido");
  }
  if (existing.chamadoId) {
    const row = await prisma.pedidoClientePdv.update({
      where: { id },
      data: { status: "enviado" },
    });
    return pedidoToView(row);
  }

  const view = pedidoToView(existing);
  const chamadoCtx = await getChamadoUserContext(ctx.email);
  if (!chamadoCtx) throw new Error("user_not_found");

  const chamado = await createChamado(
    {
      titulo: `Novo cliente: ${view.nomeFantasia}`,
      descricao: formatPedidoChamadoDesc(view),
      prioridade: "alta",
      setores: ["financeiro"],
      responsaveis: [],
    },
    chamadoCtx,
  );

  const row = await prisma.pedidoClientePdv.update({
    where: { id },
    data: { status: "enviado", chamadoId: chamado.id },
  });

  if (row.prospectId) {
    await prisma.prospect.update({
      where: { id: row.prospectId },
      data: { pedidoClienteId: row.id },
    });
  }

  return pedidoToView(row);
}

export async function importPedidoToRio(
  id: string,
  ctx: PedidoUserContext,
): Promise<PedidoClienteView> {
  const existing = await prisma.pedidoClientePdv.findUnique({ where: { id } });
  if (!existing) throw new Error("not_found");
  if (existing.status === "importado" && existing.rioLinhaId) {
    return pedidoToView(existing);
  }
  if (existing.status === "cancelado") throw new Error("pedido_cancelado");

  const view = pedidoToView(existing);
  const months = await prisma.rioCompMonth.findMany({
    orderBy: { yearMonth: "desc" },
    select: { id: true, yearMonth: true, closedAt: true },
  });
  const openMonths = months.filter((m) => !m.closedAt);
  const vigenteYm = pickVigenteRioYearMonth(openMonths, currentBrazilYearMonth());
  const month = openMonths.find((m) => m.yearMonth === vigenteYm) ?? openMonths[0];
  if (!month) throw new Error("rio_month_not_found");

  const linha = await createRioCompClienteLinha(month.id, {
    rioGrupoId: view.rioGrupoId ?? undefined,
    nomeFantasia: view.nomeFantasia,
    documento: view.documento ?? undefined,
  });

  await patchRioCompClienteLinha(linha.id, {
    razaoSocial: view.razaoSocial || view.nomeFantasia,
    documento: view.documento,
    numeroPdvSite: view.numeroPdvSite,
    categoriaSite: view.categoriaSite,
    observacoesLinha: view.observacoesCliente,
    valorPdvUnitarioTexto: view.valorPdvUnitarioTexto,
    origemCliente: view.origemCliente,
    grupoSite: view.grupoSite,
    rioGrupoId: view.rioGrupoId,
  });

  if (view.emailCobranca) {
    await prisma.rioCompClienteLinha.update({
      where: { id: linha.id },
      data: { emailCobranca: view.emailCobranca },
    });
  }

  const pdvRows = view.pdvs.length > 0 ? view.pdvs : [{ nome: view.nomeFantasia, documento: view.documento }];
  await createRioCompPdvsBulk(
    linha.id,
    pdvRows.map((p) => ({ nome: p.nome || view.nomeFantasia, documento: p.documento || view.documento })),
  );

  const row = await prisma.pedidoClientePdv.update({
    where: { id },
    data: {
      status: "importado",
      rioLinhaId: linha.id,
      importadoEm: new Date(),
      importadoPorEmail: ctx.email,
    },
  });

  return pedidoToView(row);
}

export function parsePedidoStatus(raw: unknown): PedidoClienteStatus | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase() as PedidoClienteStatus;
  return VALID_STATUS.has(v) ? v : null;
}

export function parsePdvsArray(raw: unknown): Partial<PedidoPdvPayload>[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => typeof x === "object" && x !== null) as Partial<PedidoPdvPayload>[];
}
