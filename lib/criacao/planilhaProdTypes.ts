export type PlanilhaProdSistema = "painel" | "dois_sistemas" | "player5" | "cancelado";

export type PlanilhaProdRowDto = {
  id: string;
  monthId: string;
  sistema: PlanilhaProdSistema;
  clienteLabel: string;
  criativo: string;
  entregaAtl: string;
  convertidoGain: string;
  arrastado: string;
  sincronizado: string;
  statusPlayerNovo: string;
  obsCriacao: string;
  obsProducao: string;
  linkedClienteRef: string;
  linkedProgramacaoId: string;
  linkedClienteNome: string;
  linkedProgramacaoNome: string;
  sortOrder: number;
};

export type PlanilhaProdMonthDto = {
  id: string;
  slug: string;
  label: string;
  sortKey: number;
  rowCount: number;
};

export type PlanilhaProdMonthPayload = {
  month: PlanilhaProdMonthDto;
  rows: PlanilhaProdRowDto[];
};

export const PLANILHA_PROD_SISTEMA_LABEL: Record<PlanilhaProdSistema, string> = {
  painel: "(Painel)",
  dois_sistemas: "(2 Sistemas)",
  player5: "(PLAYER 5)",
  cancelado: "(Antigo/Cancelado)",
};

export const PLANILHA_PROD_COLUMNS = [
  { key: "sistema", label: "Sistema", width: "9rem" },
  { key: "clienteLabel", label: "Cliente / programação", width: "16rem" },
  { key: "criativo", label: "Criativo", width: "5rem" },
  { key: "entregaAtl", label: "Entrega ATL", width: "8rem" },
  { key: "convertidoGain", label: "Convertido/Gain", width: "7rem" },
  { key: "arrastado", label: "Arrastado", width: "6rem" },
  { key: "sincronizado", label: "Sincronizado", width: "7rem" },
  { key: "statusPlayerNovo", label: "Status Player novo", width: "8rem" },
  { key: "obsCriacao", label: "Obs Criação", width: "10rem" },
  { key: "obsProducao", label: "Obs Produção", width: "10rem" },
] as const;
