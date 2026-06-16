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

export type PedidoPdvView = {
  id: string;
  status: PedidoClienteStatus;
  chamadoId: string | null;
  rioLinhaId: string | null;
  rioPdvId: string | null;
  importadoEm: string | null;
  importadoPorEmail: string | null;
  prospectId: string | null;
  nomeFantasia: string;
  clienteNome: string;
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
  criadoPorEmail: string;
  criadoPorNome: string;
  createdAt: string;
  updatedAt: string;
};

/** @deprecated legado — use PedidoPdvView */
export type PedidoClienteView = PedidoPdvView;

/** @deprecated legado */
export type PedidoPdvPayload = Record<string, never>;

/** @deprecated legado */
export const EMPTY_PDVS = {} as Record<string, never>;
