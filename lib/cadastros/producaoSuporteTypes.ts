import type { DashboardPdvTelemetry } from "@/lib/cadastros/producaoDashboardService";

export type SuportePdvRow = {
  rioPdvKey: string;
  nome: string;
  tagCobranca: import("@/lib/rio/rioTagCobranca").RioTagCobranca;
  cnpj: string;
  clienteNome: string;
  clienteTagCobranca: import("@/lib/rio/rioTagCobranca").RioTagCobranca;
  clienteKey: string;
  /** ID do PDV no Player (ex. 100001 → 100.001). */
  portalPdvId: number | null;
  /** ID do cliente no Player (100, 101, …). */
  portalClienteId: number | null;
  /** E-mail de login no Player 5 (cliente). */
  clienteLoginEmail: string | null;
  /** Senha de login no Player 5 (cliente). */
  clienteLoginPassword: string | null;
  /** Login ainda não gerado no portal. */
  clienteLoginPending: boolean;
  /** Chave serial de instalação (suporte). */
  playerInstalacaoToken: string | null;
  programacaoMusical: string;
  /** Programação amarrada na Central de programações (criação), por PDV. */
  programacaoCriacaoNome: string | null;
  playerVersion: string | null;
  contatoLojaNome: string;
  contatoLojaTelefone: string;
  contatoLojaEmail: string;
  googleMapsQuery: string;
  googleMapsUrl: string;
  instaladoAt: string;
  semPing5Dias: boolean;
  telemetry: DashboardPdvTelemetry;
  statusPlayer: "Ativo" | "Inativo";
  controlarPlayer: boolean;
};

export type SuporteOverview = {
  totalPdvs: number;
  semPing5Dias: number;
  chamadosAbertos: number | null;
  /** Player 5 → cloud2 → portal respondeu com ping/cache. */
  telemetriaDisponivel: boolean;
  pingsHoje: number | null;
  cacheMedioPercent: number | null;
};

export type ProducaoSuportePayload = {
  layoutYearMonth: number;
  rioSourceYearMonth: number;
  overview: SuporteOverview;
  pdvs: SuportePdvRow[];
  /** Usuário pode regerar token (perfil suporte). */
  canRegenerarToken: boolean;
};
