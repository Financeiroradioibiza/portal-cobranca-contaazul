/** Item retornado por contas-a-receber/buscar (campos usados pelo portal). */
export type CaReceivableItem = {
  id: string;
  /** Se a API enviar, preferir para GET /parcelas/{id} */
  id_parcela?: string;
  idParcela?: string;
  descricao: string;
  data_vencimento: string;
  data_competencia?: string;
  status?: string;
  status_traduzido?: string;
  total: number;
  nao_pago: number;
  cliente?: { id: string; nome: string };
};

export type CaReceivableSearchResponse = {
  itens_totais: number;
  itens: CaReceivableItem[];
};

export type CaPerson = {
  id: string;
  nome: string;
  documento?: string | null;
  email?: string | null;
};

export type CaPeopleSearchResponse = {
  itens?: CaPerson[];
  items?: CaPerson[];
};

/** Detalhe da parcela (GET …/parcelas/{id}) — campos parciais para links de boleto/documento. */
export type CaInstallmentDetail = {
  id?: string;
  anexos?: Array<{
    url?: string | null;
    tipo_anexo?: string;
    nome?: string | null;
    descricao?: string | null;
  }>;
  solicitacoes_cobrancas?: Array<{
    url?: string | null;
    tipo_solicitacao_cobranca?: string;
  }>;
};

export function todayYmdLocal(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parcela vencida (vencimento antes de hoje) com saldo em aberto. */
export function isPastDueOpen(item: CaReceivableItem): boolean {
  if (!item.nao_pago || item.nao_pago <= 0) return false;
  const today = todayYmdLocal();
  if (!item.data_vencimento) return false;
  return item.data_vencimento < today;
}
