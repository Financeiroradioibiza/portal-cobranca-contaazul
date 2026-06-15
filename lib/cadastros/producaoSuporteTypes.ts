import type { DashboardPdvTelemetry } from "@/lib/cadastros/producaoDashboardService";

export type SuportePdvRow = {
  rioPdvKey: string;
  nome: string;
  cnpj: string;
  clienteNome: string;
  clienteKey: string;
  /** ID no painel legado (vínculo cadastro), se existir. */
  painelPdvId: number | null;
  painelClienteId: number | null;
  programacaoMusical: string;
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
};

export type ProducaoSuportePayload = {
  yearMonth: number;
  overview: SuporteOverview;
  pdvs: SuportePdvRow[];
};
