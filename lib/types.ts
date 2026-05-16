export type SaleRow = {
  id: string;
  comp: string;
  due: string;
  summary: string;
  value: number;
};

export type ClientRow = {
  id: string;
  fantasy: string;
  cnpj: string;
  email: string;
  /**
   * Número(s) de contrato com status ATIVO na Conta Azul (GET /v1/contratos).
   * Separados por vírgula se houver mais de um.
   */
  activeContractNumbers: string | null;
  /** Somente portal; persistido no banco. */
  note: string;
  sales: SaleRow[];
};
