import type { DashboardPdvTelemetry } from "@/lib/cadastros/producaoDashboardService";

export type SuportePdvRow = {
  rioPdvKey: string;
  nome: string;
  tagCobranca: import("@/lib/rio/rioTagCobranca").RioTagCobranca;
  cnpj: string;
  clienteNome: string;
  clienteTagCobranca: import("@/lib/rio/rioTagCobranca").RioTagCobranca;
  clienteKey: string;
  portalPdvId: number | null;
  portalClienteId: number | null;
  clienteLoginEmail: string | null;
  clienteLoginPassword: string | null;
  clienteLoginPending: boolean;
  playerInstalacaoToken: string | null;
  programacaoMusical: string;
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
  /** Player com token amarrado e pelo menos 1º ping. */
  playersInstalados: number;
  /** PDV com ID Player mas ainda sem 1º ping. */
  semPrimeiroPing: number;
  /** Clientes Rio com movimento saída (fora baseline). */
  clientesCancelados: number;
  chamadosAbertos: number | null;
  telemetriaDisponivel: boolean;
  pingsHoje: number | null;
  cacheMedioPercent: number | null;
};

export type SuporteClienteSummary = {
  key: string;
  nome: string;
  tagCobranca: import("@/lib/rio/rioTagCobranca").RioTagCobranca;
  portalClienteId: number | null;
  pdvCount: number;
  semPingCount: number;
};

export type SuporteClienteCancelado = {
  rioLinhaId: string;
  nome: string;
  tagCobranca: import("@/lib/rio/rioTagCobranca").RioTagCobranca;
  dataSaidaTexto: string | null;
};

export type ProducaoSuporteEspelhoStored = {
  layoutYearMonth: number;
  rioSourceYearMonth: number;
  overview: SuporteOverview;
  pdvs: SuportePdvRow[];
  clientes: SuporteClienteSummary[];
  clientesCancelados: SuporteClienteCancelado[];
  espelhoBuiltAt: string;
  espelhoTelemetryAt: string | null;
};

export type ProducaoSuportePayload = {
  layoutYearMonth: number;
  rioSourceYearMonth: number;
  overview: SuporteOverview;
  pdvs: SuportePdvRow[];
  clientes?: SuporteClienteSummary[];
  clientesCancelados?: SuporteClienteCancelado[];
  espelhoBuiltAt?: string;
  espelhoTelemetryAt?: string | null;
  /** espelho = snapshot Neon · live = cálculo na hora · espelho_fallback = espelho quebrou */
  suporteFonte?: "espelho" | "live" | "espelho_fallback";
  suporteFonteErro?: string | null;
  canRegenerarToken: boolean;
};
