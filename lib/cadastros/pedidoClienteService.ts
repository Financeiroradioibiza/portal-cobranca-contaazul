import type { PedidoClientePdv, PedidoClienteStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createChamado, getChamadoUserContext } from "@/lib/chamados/chamadoService";
import type { PedidoPdvView } from "@/lib/cadastros/prospectTypes";
import { updatePdvCadastro } from "@/lib/cadastros/producaoPdvCadastroService";
import { createRioCompPdv } from "@/lib/rio/rioClienteCompService";
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

export type SavePedidoPdvInput = {
  nomeFantasia: string;
  clienteNome?: string;
  rioLinhaId?: string | null;
  rioPdvId?: string | null;
  razaoSocial?: string;
  documento?: string;
  cep?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  contatoLojaNome?: string;
  contatoLojaWhatsapp?: string;
  contatoLojaEmail?: string;
  contatoCobrancaNome?: string;
  contatoCobrancaEmail?: string;
  contatoCobrancaTel?: string;
  prospectId?: string | null;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function buildPedidoData(input: Partial<SavePedidoPdvInput>) {
  return {
    ...(input.nomeFantasia !== undefined ?
      { nomeFantasia: input.nomeFantasia.trim().slice(0, 200) }
    : {}),
    ...(input.clienteNome !== undefined ?
      { clienteNome: input.clienteNome.trim().slice(0, 200) }
    : {}),
    ...(input.rioLinhaId !== undefined ?
      { rioLinhaId: input.rioLinhaId?.trim() || null }
    : {}),
    ...(input.rioPdvId !== undefined ? { rioPdvId: input.rioPdvId?.trim() || null } : {}),
    ...(input.razaoSocial !== undefined ?
      { razaoSocial: input.razaoSocial.trim().slice(0, 8000) }
    : {}),
    ...(input.documento !== undefined ?
      { documento: str(input.documento).slice(0, 64) || null }
    : {}),
    ...(input.cep !== undefined ? { cep: str(input.cep).slice(0, 12) } : {}),
    ...(input.endereco !== undefined ? { endereco: str(input.endereco).slice(0, 8000) } : {}),
    ...(input.numero !== undefined ? { numero: str(input.numero).slice(0, 20) } : {}),
    ...(input.complemento !== undefined ?
      { complemento: str(input.complemento).slice(0, 80) }
    : {}),
    ...(input.bairro !== undefined ? { bairro: str(input.bairro).slice(0, 80) } : {}),
    ...(input.cidade !== undefined ? { cidade: str(input.cidade).slice(0, 80) } : {}),
    ...(input.uf !== undefined ? { uf: str(input.uf).slice(0, 2).toUpperCase() } : {}),
    ...(input.contatoLojaNome !== undefined ?
      { contatoLojaNome: str(input.contatoLojaNome).slice(0, 120) }
    : {}),
    ...(input.contatoLojaWhatsapp !== undefined ?
      { contatoLojaWhatsapp: str(input.contatoLojaWhatsapp).slice(0, 40) }
    : {}),
    ...(input.contatoLojaEmail !== undefined ?
      { contatoLojaEmail: str(input.contatoLojaEmail).slice(0, 200) }
    : {}),
    ...(input.contatoCobrancaNome !== undefined ?
      { contatoCobrancaNome: str(input.contatoCobrancaNome).slice(0, 120) }
    : {}),
    ...(input.contatoCobrancaEmail !== undefined ?
      { contatoCobrancaEmail: str(input.contatoCobrancaEmail).slice(0, 200) }
    : {}),
    ...(input.contatoCobrancaTel !== undefined ?
      { contatoCobrancaTel: str(input.contatoCobrancaTel).slice(0, 40) }
    : {}),
    ...(input.prospectId !== undefined ? { prospectId: input.prospectId?.trim() || null } : {}),
  };
}

export function pedidoToView(row: PedidoClientePdv): PedidoPdvView {
  return {
    id: row.id,
    status: row.status,
    chamadoId: row.chamadoId,
    rioLinhaId: row.rioLinhaId,
    rioPdvId: row.rioPdvId,
    importadoEm: row.importadoEm?.toISOString() ?? null,
    importadoPorEmail: row.importadoPorEmail,
    prospectId: row.prospectId,
    nomeFantasia: row.nomeFantasia,
    clienteNome: row.clienteNome,
    razaoSocial: row.razaoSocial,
    documento: row.documento,
    cep: row.cep,
    endereco: row.endereco,
    numero: row.numero,
    complemento: row.complemento,
    bairro: row.bairro,
    cidade: row.cidade,
    uf: row.uf,
    contatoLojaNome: row.contatoLojaNome,
    contatoLojaWhatsapp: row.contatoLojaWhatsapp,
    contatoLojaEmail: row.contatoLojaEmail,
    contatoCobrancaNome: row.contatoCobrancaNome,
    contatoCobrancaEmail: row.contatoCobrancaEmail,
    contatoCobrancaTel: row.contatoCobrancaTel,
    criadoPorEmail: row.criadoPorEmail,
    criadoPorNome: row.criadoPorNome,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function formatEndereco(p: PedidoPdvView): string {
  const parts = [
    p.endereco,
    p.numero ? `nº ${p.numero}` : "",
    p.complemento,
    p.bairro,
    p.cidade && p.uf ? `${p.cidade}/${p.uf}` : p.cidade || p.uf,
    p.cep ? `CEP ${p.cep}` : "",
  ].filter(Boolean);
  return parts.join(", ") || "—";
}

function formatPedidoChamadoDesc(p: PedidoPdvView): string {
  return [
    `Solicitação de PDV #${p.id}`,
    "",
    "— Dados do PDV —",
    `Nome fantasia loja: ${p.nomeFantasia}`,
    `Cliente (Planilha Rio): ${p.clienteNome || "—"}`,
    `Razão social: ${p.razaoSocial || "—"}`,
    `CNPJ: ${p.documento || "—"}`,
    `Endereço: ${formatEndereco(p)}`,
    "",
    "— Contato loja —",
    `Nome: ${p.contatoLojaNome || "—"}`,
    `WhatsApp: ${p.contatoLojaWhatsapp || "—"}`,
    `E-mail: ${p.contatoLojaEmail || "—"}`,
    "",
    "— Contato cobrança —",
    `Responsável: ${p.contatoCobrancaNome || "—"}`,
    `E-mail: ${p.contatoCobrancaEmail || "—"}`,
    `Telefone: ${p.contatoCobrancaTel || "—"}`,
    "",
    `Abrir pedido: /cadastros/solicitar-pdv?id=${p.id}`,
    "",
    "Obs.: cadastre o cliente na Planilha Rio antes de importar o PDV.",
  ].join("\n");
}

export async function listPedidosCliente(): Promise<PedidoPdvView[]> {
  const rows = await prisma.pedidoClientePdv.findMany({ orderBy: { updatedAt: "desc" } });
  return rows.map(pedidoToView);
}

export async function getPedidoCliente(id: string): Promise<PedidoPdvView | null> {
  const row = await prisma.pedidoClientePdv.findUnique({ where: { id } });
  return row ? pedidoToView(row) : null;
}

export async function createPedidoCliente(
  input: SavePedidoPdvInput,
  ctx: PedidoUserContext,
): Promise<PedidoPdvView> {
  const nomeFantasia = input.nomeFantasia.trim().slice(0, 200);
  if (!nomeFantasia) throw new Error("nome_obrigatorio");

  const row = await prisma.pedidoClientePdv.create({
    data: {
      ...buildPedidoData(input),
      nomeFantasia,
      razaoSocial: str(input.razaoSocial).slice(0, 8000) || nomeFantasia,
      criadoPorEmail: ctx.email,
      criadoPorNome: ctx.displayName,
    },
  });
  return pedidoToView(row);
}

export async function updatePedidoCliente(
  id: string,
  input: Partial<SavePedidoPdvInput>,
): Promise<PedidoPdvView> {
  const existing = await prisma.pedidoClientePdv.findUnique({ where: { id } });
  if (!existing) throw new Error("not_found");
  if (existing.status === "cancelado") throw new Error("pedido_cancelado");

  if (input.nomeFantasia !== undefined && !input.nomeFantasia.trim()) {
    throw new Error("nome_obrigatorio");
  }

  const row = await prisma.pedidoClientePdv.update({
    where: { id },
    data: buildPedidoData(input),
  });
  return pedidoToView(row);
}

function validatePedidoForProducaoSync(view: PedidoPdvView): void {
  if (!view.rioLinhaId?.trim()) throw new Error("cliente_obrigatorio");
  if (!view.rioPdvId?.trim()) throw new Error("pdv_obrigatorio");
  if (!view.nomeFantasia.trim()) throw new Error("nome_obrigatorio");
  if (!view.documento?.trim()) throw new Error("cnpj_obrigatorio");
  if (!view.cep.trim()) throw new Error("cep_obrigatorio");
  if (!view.endereco.trim()) throw new Error("endereco_obrigatorio");
  if (!view.bairro.trim()) throw new Error("bairro_obrigatorio");
  if (!view.cidade.trim()) throw new Error("cidade_obrigatorio");
  if (!view.uf.trim()) throw new Error("uf_obrigatorio");
  if (!view.contatoLojaNome.trim()) throw new Error("contato_loja_obrigatorio");
  if (!view.contatoLojaWhatsapp.trim()) throw new Error("whatsapp_loja_obrigatorio");
  if (!view.contatoLojaEmail.trim()) throw new Error("email_loja_obrigatorio");
}

export async function syncPedidoToProducaoCadastro(id: string): Promise<PedidoPdvView> {
  const existing = await prisma.pedidoClientePdv.findUnique({ where: { id } });
  if (!existing) throw new Error("not_found");
  if (existing.status === "cancelado") throw new Error("pedido_cancelado");

  const view = pedidoToView(existing);
  validatePedidoForProducaoSync(view);

  const pdv = await prisma.rioCompPdv.findFirst({
    where: { id: view.rioPdvId!, clienteId: view.rioLinhaId! },
    select: { id: true },
  });
  if (!pdv) throw new Error("pdv_rio_invalido");

  await updatePdvCadastro(view.rioPdvId!, {
    nome: view.nomeFantasia.trim(),
    razaoSocial: view.razaoSocial.trim() || view.nomeFantasia.trim(),
    cnpj: view.documento?.trim() ?? "",
    cep: view.cep.trim(),
    endereco: view.endereco.trim(),
    numero: view.numero.trim(),
    complemento: view.complemento.trim(),
    bairro: view.bairro.trim(),
    cidade: view.cidade.trim(),
    estado: view.uf.trim().toUpperCase(),
    contatoLojaNome: view.contatoLojaNome.trim(),
    contatoLojaEmail: view.contatoLojaEmail.trim(),
    contatoLojaTelefone: view.contatoLojaWhatsapp.trim(),
    contatoCobrancaNome: view.contatoCobrancaNome.trim(),
    contatoCobrancaEmail: view.contatoCobrancaEmail.trim(),
    contatoCobrancaTelefone: view.contatoCobrancaTel.trim(),
  });

  const row = await prisma.pedidoClientePdv.update({
    where: { id },
    data: {
      rioLinhaId: view.rioLinhaId,
      rioPdvId: view.rioPdvId,
      status: existing.status === "rascunho" ? "em_analise" : existing.status,
    },
  });

  return pedidoToView(row);
}

export async function enviarPedidoCliente(
  id: string,
  ctx: PedidoUserContext,
): Promise<PedidoPdvView> {
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
      titulo: `Solicitar PDV: ${view.nomeFantasia}`,
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

async function findRioLinhaForCliente(clienteNome: string, monthId: string) {
  const needle = clienteNome.trim().toLowerCase();
  if (!needle) return null;
  const linhas = await prisma.rioCompClienteLinha.findMany({
    where: { monthId },
    select: { id: true, nomeFantasia: true, razaoSocial: true, grupoSite: true },
  });
  return (
    linhas.find(
      (l) =>
        l.nomeFantasia.trim().toLowerCase() === needle ||
        l.razaoSocial.trim().toLowerCase() === needle ||
        l.grupoSite.trim().toLowerCase() === needle,
    ) ?? null
  );
}

export async function importPedidoToRio(
  id: string,
  ctx: PedidoUserContext,
): Promise<PedidoPdvView> {
  const existing = await prisma.pedidoClientePdv.findUnique({ where: { id } });
  if (!existing) throw new Error("not_found");
  if (existing.status === "importado" && existing.rioPdvId) {
    return pedidoToView(existing);
  }
  if (existing.status === "cancelado") throw new Error("pedido_cancelado");

  const view = pedidoToView(existing);
  if (!view.clienteNome.trim()) throw new Error("cliente_obrigatorio");

  const months = await prisma.rioCompMonth.findMany({
    orderBy: { yearMonth: "desc" },
    select: { id: true, yearMonth: true, closedAt: true },
  });
  const openMonths = months.filter((m) => !m.closedAt);
  const vigenteYm = pickVigenteRioYearMonth(openMonths, currentBrazilYearMonth());
  const month = openMonths.find((m) => m.yearMonth === vigenteYm) ?? openMonths[0];
  if (!month) throw new Error("rio_month_not_found");

  const linha = await findRioLinhaForCliente(view.clienteNome, month.id);
  if (!linha) throw new Error("cliente_rio_nao_encontrado");

  const notes = [
    formatEndereco(view),
    view.contatoLojaNome ? `Loja: ${view.contatoLojaNome}` : "",
    view.contatoLojaWhatsapp ? `WhatsApp: ${view.contatoLojaWhatsapp}` : "",
    view.contatoLojaEmail ? `E-mail loja: ${view.contatoLojaEmail}` : "",
    view.contatoCobrancaNome ? `Cobrança: ${view.contatoCobrancaNome}` : "",
    view.contatoCobrancaEmail ? `E-mail cobrança: ${view.contatoCobrancaEmail}` : "",
    view.contatoCobrancaTel ? `Tel. cobrança: ${view.contatoCobrancaTel}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const { pdv } = await createRioCompPdv(linha.id, view.nomeFantasia);
  if (view.documento || notes) {
    await prisma.rioCompPdv.update({
      where: { id: pdv.id },
      data: {
        documento: view.documento,
        notes: notes.slice(0, 8000),
      },
    });
  }

  if (view.contatoCobrancaEmail) {
    await prisma.rioCompClienteLinha.update({
      where: { id: linha.id },
      data: { emailCobranca: view.contatoCobrancaEmail },
    });
  }

  const row = await prisma.pedidoClientePdv.update({
    where: { id },
    data: {
      status: "importado",
      rioLinhaId: linha.id,
      rioPdvId: pdv.id,
      importadoEm: new Date(),
      importadoPorEmail: ctx.email,
    },
  });

  return pedidoToView(row);
}

export function parsePedidoBody(body: Record<string, unknown>): Partial<SavePedidoPdvInput> {
  return {
    nomeFantasia: str(body.nomeFantasia),
    clienteNome: str(body.clienteNome),
    rioLinhaId: typeof body.rioLinhaId === "string" ? body.rioLinhaId : null,
    rioPdvId: typeof body.rioPdvId === "string" ? body.rioPdvId : null,
    razaoSocial: str(body.razaoSocial),
    documento: str(body.documento),
    cep: str(body.cep),
    endereco: str(body.endereco),
    numero: str(body.numero),
    complemento: str(body.complemento),
    bairro: str(body.bairro),
    cidade: str(body.cidade),
    uf: str(body.uf),
    contatoLojaNome: str(body.contatoLojaNome),
    contatoLojaWhatsapp: str(body.contatoLojaWhatsapp),
    contatoLojaEmail: str(body.contatoLojaEmail),
    contatoCobrancaNome: str(body.contatoCobrancaNome),
    contatoCobrancaEmail: str(body.contatoCobrancaEmail),
    contatoCobrancaTel: str(body.contatoCobrancaTel),
    prospectId: typeof body.prospectId === "string" ? body.prospectId : null,
  };
}
