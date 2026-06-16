import type { PedidoClienteStatus, ProspectEstagio } from "@prisma/client";

export type ProspectView = {
  id: string;
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
  propostaEnviadaEm: string | null;
  demoEnviadaEm: string | null;
  fechadoEm: string | null;
  rioGrupoNome: string;
  templateProgramacao: string;
  pedidoClienteId: string | null;
  criadoPorEmail: string;
  criadoPorNome: string;
  createdAt: string;
  updatedAt: string;
};

export type PedidoPdvPayload = {
  nome: string;
  documento: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  programacaoMusical: string;
  contatoLojaNome: string;
  contatoLojaEmail: string;
  contatoLojaTelefone: string;
  contatoCobrancaNome: string;
  contatoCobrancaEmail: string;
  contatoCobrancaTelefone: string;
  observacoes: string;
};

export type PedidoClienteView = {
  id: string;
  status: PedidoClienteStatus;
  chamadoId: string | null;
  rioLinhaId: string | null;
  importadoEm: string | null;
  importadoPorEmail: string | null;
  prospectId: string | null;
  nomeFantasia: string;
  razaoSocial: string;
  documento: string | null;
  emailCobranca: string;
  origemCliente: string;
  valorPdvUnitarioTexto: string;
  numeroPdvSite: number;
  categoriaSite: string;
  observacoesCliente: string;
  rioGrupoId: string | null;
  grupoSite: string;
  pdvs: PedidoPdvPayload[];
  criadoPorEmail: string;
  criadoPorNome: string;
  createdAt: string;
  updatedAt: string;
};

export const EMPTY_PDVS: PedidoPdvPayload = {
  nome: "",
  documento: "",
  cep: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  programacaoMusical: "",
  contatoLojaNome: "",
  contatoLojaEmail: "",
  contatoLojaTelefone: "",
  contatoCobrancaNome: "",
  contatoCobrancaEmail: "",
  contatoCobrancaTelefone: "",
  observacoes: "",
};
