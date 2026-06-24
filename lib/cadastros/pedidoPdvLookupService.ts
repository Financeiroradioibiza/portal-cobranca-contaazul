import { prisma } from "@/lib/prisma";
import { isLinhaAsPdvKey } from "@/lib/cadastros/producaoHierarchy";
import { pickVigenteRioYearMonth } from "@/lib/cadastros/vigenteRioMonth";
import { currentBrazilYearMonth } from "@/lib/manualReminders/yearMonth";
import { fetchContatosCaForLinha } from "@/lib/cadastros/producaoPdvCadastroService";

export type RioClienteOption = {
  id: string;
  nome: string;
  razaoSocial: string;
  documento: string | null;
};

export type RioPdvOption = {
  id: string;
  nome: string;
  documento: string | null;
};

export type PedidoPdvPrefill = {
  rioLinhaId: string;
  rioPdvId: string;
  clienteNome: string;
  nomeFantasia: string;
  razaoSocial: string;
  documento: string | null;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  contatoLojaNome: string;
  contatoLojaWhatsapp: string;
  contatoLojaEmail: string;
  contatoCobrancaNome: string;
  contatoCobrancaEmail: string;
  contatoCobrancaTel: string;
  fromProducao: boolean;
};

async function resolveVigenteMonthId(yearMonth?: number): Promise<{ monthId: string; yearMonth: number } | null> {
  const months = await prisma.rioCompMonth.findMany({
    orderBy: { yearMonth: "desc" },
    select: { id: true, yearMonth: true, closedAt: true },
  });
  const openMonths = months.filter((m) => !m.closedAt);
  const vigenteYm = pickVigenteRioYearMonth(openMonths, yearMonth ?? currentBrazilYearMonth());
  const month = openMonths.find((m) => m.yearMonth === vigenteYm) ?? openMonths[0];
  if (!month) return null;
  return { monthId: month.id, yearMonth: month.yearMonth };
}

export async function listRioClientesForPedido(yearMonth?: number): Promise<{
  yearMonth: number;
  clientes: RioClienteOption[];
}> {
  const ctx = await resolveVigenteMonthId(yearMonth);
  if (!ctx) return { yearMonth: yearMonth ?? currentBrazilYearMonth(), clientes: [] };

  const linhas = await prisma.rioCompClienteLinha.findMany({
    where: { monthId: ctx.monthId, movimento: { not: "saida" } },
    orderBy: [{ nomeFantasia: "asc" }, { razaoSocial: "asc" }],
    select: {
      id: true,
      nomeFantasia: true,
      razaoSocial: true,
      documento: true,
      grupoSite: true,
    },
  });

  const clientes: RioClienteOption[] = linhas.map((l) => ({
    id: l.id,
    nome: l.nomeFantasia.trim() || l.grupoSite.trim() || l.razaoSocial.trim() || "Sem nome",
    razaoSocial: l.razaoSocial.trim() || l.nomeFantasia.trim(),
    documento: l.documento,
  }));

  return { yearMonth: ctx.yearMonth, clientes };
}

export async function listRioPdvsForLinha(linhaId: string): Promise<RioPdvOption[]> {
  const pdvs = await prisma.rioCompPdv.findMany({
    where: { clienteId: linhaId, movimento: { not: "saida" } },
    orderBy: [{ nome: "asc" }, { id: "asc" }],
    select: { id: true, nome: true, documento: true },
  });
  return pdvs.map((p) => ({
    id: p.id,
    nome: p.nome.trim() || "Sem nome",
    documento: p.documento,
  }));
}

function pick(...values: (string | null | undefined)[]): string {
  for (const v of values) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) return t;
  }
  return "";
}

/** CNPJ do PDV — nunca herda o documento do cliente, salvo linha-as-PDV. */
function documentoForPedidoPrefill(args: {
  rioPdvId: string;
  pdvDocumento: string | null | undefined;
  linhaDocumento: string | null | undefined;
  cadastroCnpj: string | null | undefined;
}): string | null {
  const pdvDoc = args.pdvDocumento?.trim() || null;
  const linhaDoc = args.linhaDocumento?.trim() || null;
  const cadastroDoc = args.cadastroCnpj?.trim() || null;
  const linhaAsPdv = isLinhaAsPdvKey(args.rioPdvId);

  if (linhaAsPdv) {
    return pick(cadastroDoc, pdvDoc, linhaDoc) || null;
  }

  if (pdvDoc) return pdvDoc;
  if (cadastroDoc && cadastroDoc !== linhaDoc) return cadastroDoc;
  return null;
}

/** Razão social do PDV — não herda Conta Azul/cliente, salvo linha-as-PDV ou cadastro já sincronizado. */
function razaoSocialForPedidoPrefill(args: {
  rioPdvId: string;
  linhaRazaoSocial: string | null | undefined;
  linhaNomeFantasia: string | null | undefined;
  cadastroRazaoSocial: string | null | undefined;
  cadastroEndereco: string | null | undefined;
}): string {
  const linhaAsPdv = isLinhaAsPdvKey(args.rioPdvId);
  if (linhaAsPdv) {
    return pick(args.cadastroRazaoSocial, args.linhaRazaoSocial, args.linhaNomeFantasia);
  }

  const cadastroRs = args.cadastroRazaoSocial?.trim() || "";
  if (cadastroRs && args.cadastroEndereco?.trim()) return cadastroRs;
  return "";
}

export async function getPedidoPrefillForRioPdv(
  rioLinhaId: string,
  rioPdvId: string,
): Promise<PedidoPdvPrefill | null> {
  const [linha, pdv, cadastro, contatosCa] = await Promise.all([
    prisma.rioCompClienteLinha.findUnique({
      where: { id: rioLinhaId },
      select: { id: true, nomeFantasia: true, razaoSocial: true, documento: true, grupoSite: true },
    }),
    prisma.rioCompPdv.findFirst({
      where: { id: rioPdvId, clienteId: rioLinhaId },
      select: { id: true, nome: true, documento: true },
    }),
    prisma.producaoPdvCadastro.findUnique({ where: { rioPdvKey: rioPdvId } }),
    fetchContatosCaForLinha(rioLinhaId),
  ]);

  const cobranca = contatosCa.cobranca;

  if (!linha || !pdv) return null;

  const clienteNome =
    linha.nomeFantasia.trim() || linha.grupoSite.trim() || linha.razaoSocial.trim() || "Sem nome";

  const fromProducao = Boolean(cadastro);

  return {
    rioLinhaId,
    rioPdvId,
    clienteNome,
    nomeFantasia: pick(cadastro?.nome, pdv.nome),
    razaoSocial: razaoSocialForPedidoPrefill({
      rioPdvId,
      linhaRazaoSocial: linha.razaoSocial,
      linhaNomeFantasia: linha.nomeFantasia,
      cadastroRazaoSocial: cadastro?.razaoSocial,
      cadastroEndereco: cadastro?.endereco,
    }),
    documento: documentoForPedidoPrefill({
      rioPdvId,
      pdvDocumento: pdv.documento,
      linhaDocumento: linha.documento,
      cadastroCnpj: cadastro?.cnpj,
    }),
    cep: cadastro?.cep ?? "",
    endereco: cadastro?.endereco ?? "",
    numero: cadastro?.numero ?? "",
    complemento: cadastro?.complemento ?? "",
    bairro: cadastro?.bairro ?? "",
    cidade: cadastro?.cidade ?? "",
    uf: cadastro?.estado ?? "",
    contatoLojaNome: cadastro?.contatoLojaNome ?? "",
    contatoLojaWhatsapp: cadastro?.contatoLojaTelefone ?? "",
    contatoLojaEmail: cadastro?.contatoLojaEmail ?? "",
    contatoCobrancaNome: pick(cadastro?.contatoCobrancaNome, cobranca?.nome),
    contatoCobrancaEmail: pick(cadastro?.contatoCobrancaEmail, cobranca?.email),
    contatoCobrancaTel: pick(cadastro?.contatoCobrancaTelefone, cobranca?.telefone),
    fromProducao,
  };
}
